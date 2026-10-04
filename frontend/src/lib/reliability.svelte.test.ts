import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, cleanup } from 'vitest-browser-svelte';
import { createRawSnippet, tick } from 'svelte';
import type { SubsonicAPI } from 'subsonic-api';
import { session } from './api.svelte';
import { library, addCollection, pick, setMode } from './library.svelte';
import { catalogSearch, startCatalogSearch, moreCatalogSearch, disposeCatalogSearch } from './catalog-search.svelte';
import { player, play, pause, moveQueue, enqueue, disposePlayback, beginCollectionOperation } from './player.svelte';
import { readJsonPreference, writePreference, retryPreferences, subscribePreferences } from './preferences';
import { reconcileBrowseOrder, orderedBrowseCollections } from './browse-view';
import { browseCollections, registerBrowseSource } from './browse-source';
import { isElementVisible } from './dom';
import { startRuntime } from './runtime';
import { ui } from './ui-style.svelte';
import Queue from './Queue.svelte';
import CollectionDetails from './CollectionDetails.svelte';
import type { Collection, Track } from './music';

const tile: Collection = { id: 'local:album:a', rawId: 'a', source: 'local', kind: 'album', title: 'Album', sub: 'Artist', cover: '', count: 2, available: true };
const track: Track = { id: 'local:track:one', rawId: 'one', source: 'local', title: 'Song', cover: '', available: true, duration: 180 };
const child = (id = 'one', title = 'Song') => ({ id, title, albumId: 'a', album: 'Album', artist: 'Artist', duration: 180 });
const ok = <T,>(value: T) => ({ status: 'ok', ...value });
function deferred<T>() { let resolve!: (value: T) => void; let reject!: (reason: unknown) => void; const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
const api = (overrides: Record<string, unknown> = {}) => ({
  getPlaylists: vi.fn(async () => ok({ playlists: { playlist: [] } })),
  getAlbum: vi.fn(async () => ok({ album: { song: [child()] } })),
  getAlbumList2: vi.fn(async () => ok({ albumList2: { album: [] } })),
  search3: vi.fn(async () => ok({ searchResult3: { song: [child()] } })),
  scrobble: vi.fn(async () => ok({})), ...overrides,
}) as unknown as SubsonicAPI;
class TestAudio extends EventTarget {
  src = ''; paused = true; currentTime = 0; duration = 180; volume = 1;
  async play() { this.paused = false; this.dispatchEvent(new Event('play')); }
  pause() { this.paused = true; this.dispatchEvent(new Event('pause')); }
  load() {} removeAttribute() { this.src = ''; }
}
beforeEach(() => {
  vi.stubGlobal('Audio', TestAudio);
  session.api = api(); session.username = crypto.randomUUID(); session.base = 'http://localhost:1234';
  library.tiles = []; library.revision = 0;
  player.queue = []; player.index = -1; player.order = 'normal'; player.collectionOperations = []; player.error = ''; player.loadingCollectionId = ''; player.queueTab = 'queue';
});
afterEach(() => { cleanup(); disposeCatalogSearch(); disposePlayback(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('catalog generations and asynchronous intent', () => {
  it('reconciles unchanged-query refreshes, removing deleted results and preserving surviving order', async () => {
    startCatalogSearch('song', 'all');
    await vi.waitFor(() => expect(catalogSearch.loading).toBe(false));
    expect(catalogSearch.tracks.map(t => t.rawId)).toEqual(['one']);
    const response = deferred<ReturnType<typeof ok>>();
    session.api = api({ search3: vi.fn(() => response.promise) });
    startCatalogSearch('song', 'all');
    expect(catalogSearch.tracks.map(t => t.rawId)).toEqual(['one']);
    response.resolve(ok({ searchResult3: { song: [child('two')] } }));
    await vi.waitFor(() => expect(catalogSearch.loading).toBe(false));
    expect(catalogSearch.tracks.map(t => t.rawId)).toEqual(['two']);
  });
  it('refreshes all previously loaded pages before pruning and retains their order', async () => {
    const all = Array.from({ length: 120 }, (_, i) => child(String(i), `Song ${i}`));
    let refreshing = false; const lastPage = deferred<ReturnType<typeof ok>>();
    session.api = api({ search3: vi.fn(async (request: { songOffset: number; songCount: number }) => {
      if (refreshing && request.songOffset === 50) return lastPage.promise;
      return ok({ searchResult3: { song: all.slice(request.songOffset, request.songOffset + request.songCount) } });
    }) });
    startCatalogSearch('song', 'all'); await vi.waitFor(() => expect(catalogSearch.loading).toBe(false));
    moreCatalogSearch(); await vi.waitFor(() => expect(catalogSearch.loading).toBe(false)); expect(catalogSearch.tracks).toHaveLength(100);
    refreshing = true;
    startCatalogSearch('song', 'all'); // Cancel a refresh before its debounce resolves.
    startCatalogSearch('song', 'all');
    await new Promise(resolve => setTimeout(resolve, 180));
    expect(catalogSearch.tracks).toHaveLength(100); expect(catalogSearch.loading).toBe(true);
    lastPage.resolve(ok({ searchResult3: { song: all.slice(50, 100) } })); await vi.waitFor(() => expect(catalogSearch.loading).toBe(false));
    expect(catalogSearch.tracks.map(t => t.rawId)).toEqual(all.slice(0, 100).map(t => t.id));
  });
  it('a new play selection releases superseded collection loading immediately', async () => {
    const delayed = deferred<ReturnType<typeof ok>>(); session.api = api({ getAlbum: vi.fn(() => delayed.promise) });
    const old = pick(tile); expect(player.requesting).toBe(true);
    play([track]); expect(player.requesting).toBe(false);
    delayed.resolve(ok({ album: { song: [child('stale')] } })); await old;
    expect(player.queue.map(t => t.rawId)).toEqual(['one']);
  });
  it('keeps the successful snapshot on a failed refresh and ignores a superseded response', async () => {
    startCatalogSearch('song', 'all'); await vi.waitFor(() => expect(catalogSearch.loading).toBe(false));
    const late = deferred<ReturnType<typeof ok>>();
    session.api = api({ search3: vi.fn(() => late.promise) });
    startCatalogSearch('song', 'all'); await new Promise(resolve => setTimeout(resolve, 170));
    session.api = api({ search3: vi.fn(async () => { throw new Error('offline'); }) });
    startCatalogSearch('song', 'all'); await vi.waitFor(() => expect(catalogSearch.loading).toBe(false));
    late.resolve(ok({ searchResult3: { song: [child('stale')] } })); await tick();
    expect(catalogSearch.tracks.map(t => t.rawId)).toEqual(['one']); expect(catalogSearch.errors['Local music']).toBe('offline');
  });
  it('keeps loading owned by both queued adds, even while playback is paused', async () => {
    const first = deferred<ReturnType<typeof ok>>(), second = deferred<ReturnType<typeof ok>>();
    const load = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    session.api = api({ getAlbum: load });
    const a = addCollection(tile), b = addCollection(tile);
    expect(player.collectionOperations).toHaveLength(2);
    await pause(); expect(player.requesting).toBe(true);
    first.resolve(ok({ album: { song: [child()] } })); await a;
    expect(player.requesting).toBe(true); expect(load).toHaveBeenCalledTimes(2);
    second.resolve(ok({ album: { song: [child('two')] } })); await b;
    expect(player.requesting).toBe(false); expect(player.queue).toHaveLength(2); expect(player.playing).toBe(false);
  });
  it('does not append a delayed collection to a replacement queue', async () => {
    const response = deferred<ReturnType<typeof ok>>(); session.api = api({ getAlbum: vi.fn(() => response.promise) });
    const add = addCollection(tile); await tick();
    play([{ ...track, rawId: 'replacement', id: 'local:track:replacement' }]);
    response.resolve(ok({ album: { song: [child()] } })); await add;
    expect(player.queue.map(t => t.rawId)).toEqual(['replacement']); expect(player.requesting).toBe(false);
  });
  it('canceling one operation cannot clear another operation status', () => {
    const a = beginCollectionOperation('add', 'a'), b = beginCollectionOperation('add', 'b');
    a.finish(); expect(player.requesting).toBe(true); b.finish(); expect(player.requesting).toBe(false);
  });
  it('publishes a revision after a successful refresh even when the collection count stays constant', async () => {
    const before = library.revision; await setMode('albums', true); expect(library.revision).toBeGreaterThan(before);
  });
});

describe('component integration and occurrence identity', () => {
  it('preserves a queue row and keyboard focus after moving a duplicate occurrence', async () => {
    play([track, { ...track, rawId: 'two', id: 'local:track:two' }, track]);
    const ids = player.queue.map(t => t.queueEntryId); expect(new Set(ids).size).toBe(3);
    const options = createRawSnippet(() => ({ render: () => '<span></span>' }));
    render(Queue, { onclose: () => {}, palette: '', options }); await tick();
    const buttons = [...document.querySelectorAll<HTMLButtonElement>('.track-menu')];
    const selected = buttons[2]; selected.focus(); moveQueue(2, 1); await tick();
    expect([...document.querySelectorAll('.track-menu')][1]).toBe(selected); expect(document.activeElement).toBe(selected);
    expect(player.queue[1].queueEntryId).toBe(ids[2]);
    enqueue([track]); expect(new Set(player.queue.map(t => t.queueEntryId)).size).toBe(4);
  });
  it('opens and closes queue actions when native popovers are unavailable', async () => {
    const show = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'showPopover');
    const hide = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'hidePopover');
    Object.defineProperty(HTMLElement.prototype, 'showPopover', { value: undefined, configurable: true });
    Object.defineProperty(HTMLElement.prototype, 'hidePopover', { value: undefined, configurable: true });
    try {
      play([track, track]); const options = createRawSnippet(() => ({ render: () => '<span></span>' }));
      render(Queue, { onclose: () => {}, palette: '', options }); await tick();
      const trigger = document.querySelector<HTMLButtonElement>('.track-menu')!; trigger.click(); await tick();
      const menu = document.querySelector<HTMLElement>('[data-queue-actions]:not([hidden])')!;
      expect(menu).not.toBeNull(); expect(menu.contains(document.activeElement)).toBe(true);
      menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await tick();
      expect(document.activeElement).toBe(trigger); expect(menu.hidden).toBe(true);
    } finally {
      if (show) Object.defineProperty(HTMLElement.prototype, 'showPopover', show);
      if (hide) Object.defineProperty(HTMLElement.prototype, 'hidePopover', hide);
    }
  });
  it('replaces failed queue artwork and retries when the cover URL changes', async () => {
    play([{ ...track, cover: '/invalid-queue-cover.png' }]);
    const options = createRawSnippet(() => ({ render: () => '<span></span>' }));
    render(Queue, { onclose: () => {}, palette: '', options }); await tick();
    const image = document.querySelector<HTMLImageElement>('.now-playing img.detail-cover')!;
    image.dispatchEvent(new Event('error')); await tick();
    expect(document.querySelector('.now-playing img.detail-cover')).toBeNull();
    expect(document.querySelector('.now-playing .empty-art')?.getAttribute('aria-label')).toBe('Artwork unavailable for Song');
    play([{ ...track, cover: '/replacement-queue-cover.png' }]); await tick();
    expect(document.querySelector('.now-playing img.detail-cover')?.getAttribute('src')).toBe('/replacement-queue-cover.png');
  });
  it('replaces failed album artwork with an accessible placeholder', async () => {
    render(CollectionDetails, { tile: { ...tile, cover: '/invalid-album-cover.png' }, onclose: () => {} }); await tick();
    const image = document.querySelector<HTMLImageElement>('.album-view img.detail-cover')!;
    image.dispatchEvent(new Event('error')); await tick();
    expect(document.querySelector('.album-view img.detail-cover')).toBeNull();
    expect(document.querySelector('.album-view .no-art')?.getAttribute('aria-label')).toBe('Artwork unavailable for Album');
  });
  it('ignores late artwork errors after the player and album details close', async () => {
    play([{ ...track, cover: '/late-queue-cover.png' }]);
    const options = createRawSnippet(() => ({ render: () => '<span></span>' }));
    render(Queue, { onclose: () => {}, palette: '', options }); await tick();
    const queueImage = document.querySelector<HTMLImageElement>('.now-playing img.detail-cover')!;
    cleanup();
    render(CollectionDetails, { tile: { ...tile, cover: '/late-album-cover.png' }, onclose: () => {} }); await tick();
    const albumImage = document.querySelector<HTMLImageElement>('.album-view img.detail-cover')!;
    cleanup();
    const warn = vi.spyOn(console, 'warn');
    queueImage.dispatchEvent(new Event('error')); albumImage.dispatchEvent(new Event('error')); await tick();
    expect(warn).not.toHaveBeenCalled();
  });
  it('refreshes open album details after a revision with an unchanged song count', async () => {
    const getAlbum = vi.fn().mockResolvedValueOnce(ok({ album: { song: [child('one', 'Old track')] } })).mockResolvedValueOnce(ok({ album: { song: [child('two', 'Replacement track')] } }));
    session.api = api({ getAlbum }); render(CollectionDetails, { tile, onclose: () => {} });
    await vi.waitFor(() => expect(document.querySelector('.track-list')?.textContent).toContain('Old track'));
    library.revision++; await vi.waitFor(() => expect(document.querySelector('.track-list')?.textContent).toContain('Replacement track'));
    expect(document.querySelector('.track-list')?.textContent).not.toContain('Old track');
  });
  it('keeps background ordering stable and applies explicit sort changes', () => {
    const a = tile, b = { ...tile, id: 'b' }, c = { ...tile, id: 'c' };
    const previous = { key: 'sort-a', ids: [a.id, b.id] };
    const next = reconcileBrowseOrder(previous, 'sort-a', [b, c, a]);
    expect(orderedBrowseCollections([b, c, a], next).map(t => t.id)).toEqual([a.id, b.id, c.id]);
    const removed = reconcileBrowseOrder(next, 'sort-a', [c, b]); expect(removed.ids).toEqual([b.id, c.id]);
    expect(reconcileBrowseOrder(removed, 'sort-b', [c, b]).ids).toEqual([c.id, b.id]);
  });
  it('reads the current browse source synchronously and disposes it', () => {
    let selected = [tile]; const dispose = registerBrowseSource(() => selected);
    expect(browseCollections([])).toEqual([tile]); selected = []; expect(browseCollections([tile])).toEqual([]);
    dispose(); expect(browseCollections([tile])).toEqual([tile]);
  });
  it('supports settings focus checks without checkVisibility', () => {
    const button = document.createElement('button'); document.body.append(button);
    Object.defineProperty(button, 'checkVisibility', { value: undefined });
    expect(isElementVisible(button)).toBe(true); button.style.display = 'none'; expect(isElementVisible(button)).toBe(false); button.remove();
  });
});

describe('guarded preferences', () => {
  it('recovers malformed saved JSON and retries failed writes', () => {
    const key = `test:${crypto.randomUUID()}`; localStorage.setItem(key, '{bad'); expect(readJsonPreference(key, { enabled: true })).toEqual({ enabled: true });
    let status = ''; const dispose = subscribePreferences(message => { status = message; });
    const write = vi.spyOn(Storage.prototype, 'setItem').mockImplementationOnce(() => { throw new Error('quota'); });
    expect(writePreference(key, 'saved')).toBe(false); expect(status).not.toBe('');
    write.mockRestore(); retryPreferences(); expect(localStorage.getItem(key)).toBe('saved'); expect(status).toBe('');
    dispose(); localStorage.removeItem(key);
  });
});

it('starts side effects once and disposes preference subscriptions and pending playback', async () => {
  const original = ui.components; const write = vi.spyOn(Storage.prototype, 'setItem');
  const stop = startRuntime(); expect(startRuntime()).toBe(stop); await tick();
  ui.components = original === 'classic' ? 'studio' : 'classic'; await tick();
  expect(document.documentElement.dataset.components).toBe(ui.components);
  stop(); const writes = write.mock.calls.length;
  ui.components = original; await tick(); expect(write.mock.calls).toHaveLength(writes);
  expect(player.pending).toBe(false); expect(player.playing).toBe(false);
  stop();
});
