import { coverUrl, session } from './api.svelte';
import type { Collection, Track } from './music';

export type PlaybackOrigin = Pick<Collection, 'id' | 'rawId' | 'source' | 'kind' | 'title' | 'cover'>;
export type ListeningContext = { id: string; queue: Track[]; origin?: PlaybackOrigin; order: 'normal' | 'shuffle' | 'random'; permutation: number[] };
export type HistoryEntry = { id: string; context: ListeningContext; index: number; cursor: number; playedAt: number };
export const listeningHistory = $state({ entries: [] as HistoryEntry[], total: 0, hasMore: false, loading: false, query: '', error: '' });
let account = '';
let persistenceTimer: ReturnType<typeof setTimeout> | undefined;
let operations: Promise<unknown> = Promise.resolve();
let queryRevision = 0;
const pendingClears = new Set<string>();
const queuedContexts = new Map<string, Set<string>>();
const unsaved = new Map<string, ReturnType<typeof snapshot>[]>();
const scope = () => window.desktop ? `desktop:${session.username}` : key();
const key = () => `music.history.v1:${session.base}:${session.username}`;

// Keep signed local artwork URLs out of persisted history. Recreate them on use.
function storedTrack(track: Track): Track {
  const { albumInfo: _albumInfo, ...rest } = track;
  return { ...rest, playbackOrigin: rest.playbackOrigin ? { ...rest.playbackOrigin, cover: rest.playbackOrigin.source === 'local' ? '' : rest.playbackOrigin.cover } : undefined, cover: track.source === 'local' ? '' : track.cover };
}
export function historyTrack(track: Track): Track {
  return track.source === 'local' ? { ...track, cover: coverUrl(track.coverId || track.albumId?.replace(/^local:album:/, '') || track.rawId, 512) } : track;
}
export function loadHistory() {
  const next = key();
  if (next === account) return;
  account = next; listeningHistory.entries = []; listeningHistory.query = ''; listeningHistory.total = 0; listeningHistory.hasMore = false; listeningHistory.error = '';
  queryRevision++;
  try {
    const data = JSON.parse(localStorage.getItem(account) || 'null');
    if (!data || !Array.isArray(data.contexts) || !Array.isArray(data.entries)) throw new Error('No legacy history');
    const contexts = new Map<string, ListeningContext>(data.contexts.filter((c: ListeningContext) => c && typeof c.id === 'string' && Array.isArray(c.queue) && c.queue.every(t => t && typeof t.id === 'string' && typeof t.rawId === 'string' && typeof t.title === 'string' && ['local', 'spotify'].includes(t.source)) && ['normal', 'shuffle', 'random'].includes(c.order) && Array.isArray(c.permutation)).map((c: ListeningContext) => [c.id, c]));
    listeningHistory.entries = data.entries.flatMap((e: HistoryEntry & { contextId: string }) => {
      const context = contexts.get(e.contextId);
      return context && Number.isInteger(e.index) && context.queue[e.index] && typeof e.id === 'string' && Number.isFinite(e.playedAt) && e.playedAt > 0 && e.playedAt <= 8640000000000000 ? [{ id: e.id, context, index: e.index, cursor: Number.isInteger(e.cursor) ? e.cursor : 0, playedAt: e.playedAt }] : [];
    }).slice(0, 100);
  } catch { /* Missing or corrupt history must never block playback. */ }
  listeningHistory.total = listeningHistory.entries.length;
  if (window.musicHistory) {
    const batch = snapshot();
    const bridge = window.musicHistory;
    const importKey = account;
    unsaved.set(batch.scope, [...(unsaved.get(batch.scope) || []), batch]);
    enqueue(async () => { await bridge.write({ ...batch, entries: [...batch.entries].reverse(), importKey }); const pending = unsaved.get(batch.scope); if (pending) unsaved.set(batch.scope, pending.filter(item => item !== batch)); });
    void searchHistory('');
  }
}
function snapshot(entries = listeningHistory.entries, changedContext?: ListeningContext, onlyNew = false) {
  const contexts = new Map(entries.map(e => [e.context.id, e.context]));
  if (onlyNew) for (const id of contexts.keys()) if (queuedContexts.get(scope())?.has(id)) contexts.delete(id);
  if (changedContext) contexts.set(changedContext.id, changedContext);
  return $state.snapshot({ scope: scope(), contexts: [...contexts.values()].map(c => ({ ...c, origin: c.origin ? { ...c.origin, cover: c.origin.source === 'local' ? '' : c.origin.cover } : undefined, queue: c.queue.map(storedTrack) })), entries: entries.map(({ context, ...e }) => ({ ...e, contextId: context.id })) });
}
function enqueue(task: () => Promise<unknown>) {
  const activeAccount = account;
  const result = operations.then(task);
  operations = result.catch(() => {});
  void result.catch(() => { if (activeAccount === account) listeningHistory.error = 'History could not be saved or loaded. Your current session is still available. Try again.'; });
  return result;
}
function persist(entries = listeningHistory.entries, changedContext?: ListeningContext, onlyNew = false) {
  const batch = snapshot(entries, changedContext, onlyNew);
  if (window.musicHistory) {
    const bridge = window.musicHistory;
    const known = queuedContexts.get(batch.scope) || new Set<string>();
    for (const context of batch.contexts) known.add(context.id);
    queuedContexts.set(batch.scope, known);
    unsaved.set(batch.scope, [...(unsaved.get(batch.scope) || []), batch]);
    return enqueue(async () => {
      const pending = unsaved.get(batch.scope) || [];
      if (!pending.length) return;
      const contexts = new Map(pending.flatMap(item => item.contexts).map(context => [context.id, context]));
      const entries = new Map(pending.flatMap(item => item.entries).map(entry => [entry.id, entry]));
      await bridge.write({ scope: batch.scope, contexts: [...contexts.values()], entries: [...entries.values()] });
      unsaved.set(batch.scope, (unsaved.get(batch.scope) || []).filter(item => !pending.includes(item)));
    });
  }
  try { localStorage.setItem(account, JSON.stringify(batch)); }
  catch { listeningHistory.error = 'Browser storage is full. Your current session is still available.'; }
}
export async function searchHistory(query = listeningHistory.query, more = false) {
  loadHistory();
  const revision = ++queryRevision;
  const activeAccount = account;
  listeningHistory.query = query;
  const bridge = window.musicHistory;
  const activeScope = scope();
  const offset = more ? listeningHistory.entries.length : 0;
  if (!bridge) return;
  listeningHistory.loading = true;
  try {
    const result = await enqueue(async () => { if (revision !== queryRevision || activeAccount !== account) return; if (pendingClears.has(activeScope) || unsaved.get(activeScope)?.length) throw new Error('Unsaved listening events'); return bridge.list({ scope: activeScope, query, offset }); }) as { entries: HistoryEntry[]; total: number; hasMore: boolean };
    if (!result || revision !== queryRevision || activeAccount !== account) return;
    const contexts = new Map(listeningHistory.entries.map(e => [e.context.id, e.context]));
    const entries = result.entries.map(e => ({ ...e, context: contexts.get(e.context.id) || e.context }));
    listeningHistory.entries = more ? [...listeningHistory.entries, ...entries.filter(e => !listeningHistory.entries.some(old => old.id === e.id))] : entries;
    listeningHistory.total = result.total; listeningHistory.hasMore = result.hasMore; listeningHistory.error = '';
  } catch { /* enqueue reports a recoverable error; keep the visible list. */ }
  finally { if (revision === queryRevision) listeningHistory.loading = false; }
}
export function recordHistory(context: ListeningContext, index: number, cursor: number) {
  loadHistory();
  listeningHistory.entries.unshift({ id: crypto.randomUUID(), context, index, cursor, playedAt: Date.now() });
  listeningHistory.total++;
  if (window.musicHistory) void persist([listeningHistory.entries[0]], undefined, true);
  else saveHistory();
  if (window.musicHistory) void searchHistory(listeningHistory.query);
  else listeningHistory.entries = listeningHistory.entries.slice(0, 100);
}
export function saveHistory(context?: ListeningContext) {
  // Storage work follows the immediate playback response.
  clearTimeout(persistenceTimer);
  if (window.musicHistory) { void persist(context ? [] : listeningHistory.entries, context); return; }
  persistenceTimer = setTimeout(() => { void persist(); }, 250);
}
export function retryHistory() { if (pendingClears.has(scope())) clearHistory(); else void persist(); void searchHistory(); }
export function clearHistory() {
  loadHistory(); clearTimeout(persistenceTimer); queryRevision++;
  listeningHistory.entries = []; listeningHistory.total = 0; listeningHistory.hasMore = false; listeningHistory.loading = false;
  if (window.musicHistory) {
    const bridge = window.musicHistory; const activeScope = scope(); const activeAccount = account;
    const discarded = unsaved.get(activeScope) || [];
    queuedContexts.delete(activeScope);
    pendingClears.add(activeScope);
    void enqueue(async () => {
      await bridge.clear(activeScope);
      unsaved.set(activeScope, (unsaved.get(activeScope) || []).filter(item => !discarded.includes(item)));
      pendingClears.delete(activeScope);
      if (account === activeAccount) listeningHistory.error = '';
    });
  }
  else persist();
}
