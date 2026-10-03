<script lang="ts">
  import { onMount, onDestroy, untrack } from 'svelte';
  import CityCanvas from './chronocity/CityCanvas.svelte';
  import StreetScene from './chronocity/StreetScene.svelte';
  import { reconcileStations, type Station } from './chronocity/layout';
  import { catalog, metadata, warmColors } from './discovery.svelte';
  import { addCollection, trackPages, type Tile } from './library.svelte';
  import { playlistArtworks, playlistStations } from './chronocity/artworks';
  import type { Track } from './music';
  import CollectionPlayback from './CollectionPlayback.svelte';
  import { spotifyPlayable, spotifyMessage } from './spotify.svelte';

  let { albums, playlistMode = false, layoutKey, discoveryId = '', active, paused = false, top, onpick, onopen, onexit }: { albums: Tile[]; playlistMode?: boolean; layoutKey: string; discoveryId?: string; active: boolean; paused?: boolean; top: number; onpick: (album: Tile) => void; onopen: (album: Tile) => void; onexit: () => void } = $props();
  let stations = $state.raw<Station[]>([]);
  let selectedId = $state(''), approachedId = '';
  let ready = $state(false), error = $state(false), reduced = $state(false), pageVisible = $state(true), holographic = $state(false), motionEnabled = $state(true), cinematic = $state(false), resetRevision = $state(0);
  let narrow = $state(false);
  let previousKey: string | undefined;
  let region: HTMLElement;
  let world = $state<StreetScene>();
  let rendererKind = $state(''), travelling = $state(false), cameraPhase = $state('manual');
  let pose = $state({ x: 0, y: 10, z: 18, yaw: 0, pitch: -0.025 });
  let collectionFocus = $state<Station | null>(null), collectionArt = $state.raw<Tile[]>([]), collectionLoading = $state(false), collectionError = $state('');
  let collectionRequest = 0;
  const artworkCache = new Map<string, Tile[]>(), knownAlbums = new Map<string, Tile>();
  const childStations = $derived(collectionFocus ? playlistStations(collectionFocus, collectionArt, narrow) : []);
  const browsing = $derived(collectionFocus && childStations.length ? childStations : stations);
  const selectedIndex = $derived(browsing.findIndex(station => station.album.id === selectedId));
  const selected = $derived(browsing[selectedIndex] ?? collectionFocus ?? stations[0]);
  const years = $derived([...new Set(browsing.map(station => station.year))].sort((a, b) => (a ?? 10000) - (b ?? 10000)));
  const district = $derived(selected?.year === null ? 'Undated' : String(selected?.year ?? ''));
  const hue = $derived(selected ? catalog.colors[selected.album.id]?.hue ?? 25 : 25);
  const running = $derived(active && pageVisible && !paused);
  $effect(() => {
    const incoming = albums, key = layoutKey;
    const years = incoming.map(album => metadata(album).year);
    untrack(() => {
      const reset = previousKey !== key;
      if (reset) { knownAlbums.clear(); artworkCache.clear(); }
      for (const tile of incoming) if (tile.kind === 'album') knownAlbums.set(tile.id, tile);
      if (reset) { collectionRequest++; collectionFocus = null; collectionArt = []; collectionLoading = false; collectionError = ''; }
      const yearMap = new Map(incoming.map((album, index) => [album.id, years[index]]));
      stations = reconcileStations(stations, incoming, album => yearMap.get(album.id), reset);
      if (reset || (!collectionFocus && !stations.some(station => station.album.id === selectedId))) selectedId = stations[0]?.album.id ?? '';
      if (reset) { cinematic = false; resetRevision++; approachedId = ''; }
      previousKey = key;
    });
  });
  onMount(() => {
    const width = matchMedia('(max-width: 699px)');
    const resize = () => (narrow = width.matches); resize(); width.addEventListener('change', resize);
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => { reduced = media.matches; if (reduced) cinematic = false; };
    update(); media.addEventListener('change', update);
    const visibility = () => { pageVisible = !document.hidden; if (!pageVisible) world?.releaseKeys(); };
    const release = () => world?.releaseKeys();
    visibility(); document.addEventListener('visibilitychange', visibility); window.addEventListener('blur', release);
    return () => { width.removeEventListener('change', resize); media.removeEventListener('change', update); document.removeEventListener('visibilitychange', visibility); window.removeEventListener('blur', release); };
  });
  $effect(() => {
    const id = discoveryId;
    untrack(() => { if (id && stations.some(station => station.album.id === id)) navigate(id); });
  });
  $effect(() => { if (!active) cinematic = false; });
  onDestroy(() => { collectionRequest++; });
  async function enterPlaylist(id: string, fly = true, retry = false) {
    if (fly) world?.stopCinematic();
    const station = stations.find(station => station.album.id === id && station.album.kind === 'playlist');
    if (!station || (collectionFocus?.album.id === id && !retry)) return;
    const mine = ++collectionRequest;
    collectionFocus = station; selectedId = id; collectionError = '';
    collectionArt = retry ? [] : artworkCache.get(id) ?? [];
    collectionLoading = !artworkCache.has(id) || retry;
    if (fly) { approachedId = id; travelling = !reduced; world?.focusAlbum(station); }
    if (!collectionLoading) { selectedId = collectionArt[0]?.id ?? id; return; }
    const tracks: Track[] = [];
    try {
      for await (const page of trackPages(station.album)) {
        if (mine !== collectionRequest) return;
        tracks.push(...page);
        collectionArt = playlistArtworks(tracks, [...knownAlbums.values()]);
        if (selectedId === id && collectionArt.length) selectedId = collectionArt[0].id;
        await new Promise(resolve => setTimeout(resolve, 16));
      }
      if (mine === collectionRequest) { artworkCache.set(id, collectionArt); if (!collectionArt.length) collectionError = 'No album artwork metadata is available for these tracks.'; }
    } catch (error) { if (mine === collectionRequest) collectionError = (error as Error).message; }
    finally { if (mine === collectionRequest) collectionLoading = false; }
  }
  function leavePlaylist() { collectionRequest++; collectionFocus = null; collectionArt = []; collectionError = ''; collectionLoading = false; selectedId = stations[0]?.album.id ?? ''; approachedId = ''; world?.reset(); }
  function navigate(id: string) {
    const station = [...stations, ...childStations].find(station => station.album.id === id);
    if (!station) return;
    if (station.album.kind === 'playlist') { void enterPlaylist(id); return; }
    selectedId = id; approachedId = id; travelling = !reduced; world?.focusAlbum(station);
  }
  function worldKeys(node: HTMLElement) {
    const moveKeys = new Set(['w', 'a', 's', 'd', 'q', 'e', 'arrowleft', 'arrowright', 'arrowup', 'arrowdown']);
    const down = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey || (event.target instanceof Element && event.target.matches('input, select, textarea'))) return;
      const key = event.key.toLowerCase();
      if (moveKeys.has(key)) { event.preventDefault(); event.stopPropagation(); world?.setKey(key, true); }
      else if (event.key === 'Escape' && cinematic) { event.preventDefault(); event.stopPropagation(); world?.stopCinematic(); }
      else if (event.key === 'Home') { event.preventDefault(); event.stopPropagation(); approachedId = ''; world?.reset(); }
      else if (event.key === 'Enter' && event.target === region && selected) { event.preventDefault(); event.stopPropagation(); onopen(selected.album); }
    };
    const up = (event: KeyboardEvent) => { world?.setKey(event.key.toLowerCase(), false); };
    const leave = (event: FocusEvent) => { if (!(event.relatedTarget instanceof Node) || !node.contains(event.relatedTarget)) world?.releaseKeys(); };
    node.addEventListener('keydown', down); window.addEventListener('keyup', up); node.addEventListener('focusout', leave);
    return { destroy() { node.removeEventListener('keydown', down); window.removeEventListener('keyup', up); node.removeEventListener('focusout', leave); } };
  }
  function wheel(event: WheelEvent) {
    if (!(event.target instanceof HTMLCanvasElement) || event.ctrlKey) return;
    event.preventDefault();
    const scale = event.deltaMode === 1 ? 0.6 : 0.025;
    world?.travel(Math.max(-10, Math.min(10, event.deltaY * scale)), Math.max(-10, Math.min(10, event.deltaX * scale)));
  }
  let gesture: { id: number; x: number; y: number; startX: number; startY: number; moved: boolean } | undefined;
  function pointerdown(event: PointerEvent) {
    if (!(event.target instanceof HTMLCanvasElement) || event.button !== 0) return;
    world?.stopCinematic();
    region.focus({ preventScroll: true });
    gesture = { id: event.pointerId, x: event.clientX, y: event.clientY, startX: event.clientX, startY: event.clientY, moved: false };
    region.setPointerCapture(event.pointerId);
  }
  function pointermove(event: PointerEvent) {
    if (!gesture || gesture.id !== event.pointerId) return;
    if (Math.hypot(event.clientX - gesture.startX, event.clientY - gesture.startY) > 7) gesture.moved = true;
    if (gesture.moved) world?.turn(event.clientX - gesture.x, event.clientY - gesture.y);
    gesture.x = event.clientX; gesture.y = event.clientY;
  }
  function pointerup(event: PointerEvent) {
    if (!gesture || gesture.id !== event.pointerId) return;
    if (!gesture.moved) {
      const id = world?.pick(event.clientX, event.clientY);
      if (id) { if (id === approachedId && selected?.album.id === id && selected.album.kind !== 'playlist') onopen(selected.album); else navigate(id); }
    }
    gesture = undefined;
    if (region.hasPointerCapture(event.pointerId)) region.releasePointerCapture(event.pointerId);
  }
  function near(stations: Station[]) { if (active) untrack(() => warmColors(stations.map(station => station.album))); }
</script>

{#snippet arrow(direction: string)}
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true" style:transform="rotate({direction === 'left' ? -90 : direction === 'right' ? 90 : direction === 'down' ? 180 : 0}deg)"><path d="M12 19V5m-6 6 6-6 6 6" /></svg>
{/snippet}
<section class="chronocity" class:concealed={!active} inert={!active || paused} style:--scene-top="{top}px" style:--neon="hsl({hue} 80% 70%)" aria-label="Chronocity album exploration" tabindex="-1" bind:this={region} use:worldKeys onwheel={wheel} onpointerdown={pointerdown} onpointermove={pointermove} onpointerup={pointerup} onpointercancel={() => (gesture = undefined)} data-renderer={rendererKind} data-ready={ready} data-selected={selectedId} data-camera-x={pose.x.toFixed(2)} data-camera-y={pose.y.toFixed(2)} data-camera-z={pose.z.toFixed(2)} data-camera-yaw={pose.yaw.toFixed(3)} data-collection={collectionFocus?.album.id ?? ''} data-artworks={childStations.length} data-camera-phase={cameraPhase} data-cinematic={cinematic} data-motion={motionEnabled && !reduced} data-travelling={travelling} data-material={holographic ? 'holographic' : 'artwork'}>
  {#if stations.length && !error}
    <div class="world"><CityCanvas active={running} onbackend={backend => (rendererKind = backend)} onerror={() => (error = true)}>
      <StreetScene bind:this={world} {stations} {childStations} cluster={collectionFocus} {selectedId} active={running} {reduced} {cinematic} oncinematicstop={() => (cinematic = false)} ontourselect={id => { selectedId = id; approachedId = id; }} floating={motionEnabled && !reduced} {holographic} {resetRevision} onready={() => (ready = true)} onerror={() => (error = true)} onpose={(next, moving, phase) => { pose = next; travelling = moving; cameraPhase = phase; }} onnear={near} onenterplaylist={id => void enterPlaylist(id, false)} />
    </CityCanvas></div>
  {/if}
  <div class="vignette" aria-hidden="true"></div>
  <header class="city-heading"><h1>Chronocity</h1><p role="status">{cinematic ? 'Cinematic tour · move to take control' : travelling ? `Approaching ${district}…` : playlistMode ? 'Playlists become collections of artwork.' : 'Fly through your album artwork.'}</p></header>
  {#if selected}
    <button class="cinematic-toggle" aria-label="Cinematic camera tour" aria-pressed={cinematic} disabled={reduced} title={reduced ? 'Cinematic movement is off with reduced motion' : 'Tour nearby artworks. Move to take control.'} onclick={() => (cinematic = !cinematic)}><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">{#if cinematic}<path d="M8 5v14M16 5v14" />{:else}<path d="m9 5 11 7-11 7Z" /><path d="M3 5v14" />{/if}</svg>{cinematic ? 'Stop tour' : 'Cinematic'}</button>
    <div class="world-options"><button aria-label="Animate floating artwork" aria-pressed={motionEnabled} onclick={() => (motionEnabled = !motionEnabled)}>{motionEnabled ? 'Pause artwork' : 'Float artwork'}</button><button class="material-toggle" aria-label="Holographic record sleeves" aria-pressed={holographic} onclick={() => (holographic = !holographic)}>{holographic ? 'Holographic' : 'Artwork'}</button><button onclick={() => { if (collectionFocus) leavePlaylist(); else { approachedId = ''; world?.reset(); } }} aria-label="Return to the entrance">{collectionFocus ? 'All playlists' : 'Entrance'}</button></div>
    {#if collectionFocus}<div class="collection-heading"><h2>{collectionFocus.album.title}</h2><p role="status">{collectionArt.length} artworks{collectionLoading ? ' · revealing more…' : ''}</p>{#if collectionError}<p class="collection-error">{collectionError}</p><button onclick={() => void enterPlaylist(collectionFocus!.album.id, false, true)}>Retry</button><button onclick={() => onopen(collectionFocus!.album)}>Playlist tracks</button>{/if}</div>{/if}
    <div class="album-console">
      <div class="album-copy"><button class="album-title" onclick={() => onopen(selected.album)} aria-label="Open {selected.album.title} — {selected.album.sub}">{selected.album.title}</button><p>{selected.album.sub}</p><span class="album-meta"><span class="year">{selected.album.kind === 'playlist' ? 'Playlist' : district}</span> · {selected.album.count} tracks{metadata(selected.album).genres.length ? ` · ${metadata(selected.album).genres.slice(0, 2).join(' / ')}` : ''}</span></div>
      <div class="album-actions"><CollectionPlayback collection={selected.album} onplay={() => !selected.album.available || (selected.album.source === 'spotify' && !spotifyPlayable()) ? onopen(selected.album) : onpick(selected.album)} /><button onclick={() => onopen(selected.album)}>Tracks</button><button disabled={!selected.album.available || (selected.album.source === 'spotify' && !spotifyPlayable())} onclick={() => void addCollection(selected.album)} aria-label="Add {selected.album.title} to queue">Queue</button><button class="approach" onclick={() => navigate(selected.album.id)}>{selected.album.kind === 'playlist' ? 'Explore artwork' : 'Approach'}</button></div>
      {#if !selected.album.available || (selected.album.source === 'spotify' && !spotifyPlayable())}<p class="availability">{selected.album.source === 'spotify' ? spotifyMessage() : 'Playback unavailable. Open tracks for details.'}</p>{/if}
    </div>
    <nav class="route" aria-label="Archive exploration">
      <div class="route-controls"><button class="step" aria-label="Previous album in Chronocity" disabled={selectedIndex <= 0} onclick={() => navigate(browsing[selectedIndex - 1].album.id)}>{@render arrow('left')}</button>{#if playlistMode && !collectionFocus}<select class="playlist-jump" aria-label="Choose a playlist" value={selected.album.id} onchange={event => void enterPlaylist(event.currentTarget.value)}>{#each stations as station}<option value={station.album.id}>{station.album.title}</option>{/each}</select>{:else}<label class="year-jump"><select aria-label="Jump to release year" value={selected.year ?? 'undated'} onchange={event => { const station = browsing.find(station => String(station.year ?? 'undated') === event.currentTarget.value); if (station) navigate(station.album.id); }}>{#each years as year}<option value={year ?? 'undated'}>{year ?? 'Undated'}</option>{/each}</select></label>{/if}<button class="step" aria-label="Next album in Chronocity" disabled={selectedIndex === browsing.length - 1} onclick={() => navigate(browsing[Math.max(0, selectedIndex + 1)].album.id)}>{@render arrow('right')}</button><span class="route-position">{Math.max(0, selectedIndex + 1)} / {browsing.length}</span></div>
      <div class="movement" aria-label="Camera movement"><button aria-label="Turn left" onclick={() => world?.turn(90, 0)}>{@render arrow('left')}</button><button aria-label="Move forward" onclick={() => world?.travel(5)}>{@render arrow('up')}</button><button aria-label="Move backward" onclick={() => world?.travel(-5)}>{@render arrow('down')}</button><button aria-label="Turn right" onclick={() => world?.turn(-90, 0)}>{@render arrow('right')}</button><button aria-label="Rise" onclick={() => world?.travel(0, 0, 4)}>Rise</button><button aria-label="Descend" onclick={() => world?.travel(0, 0, -4)}>Down</button></div>
      <p class="instructions">Scroll to fly · drag to look · WASD to move · Q / E to descend / rise</p>
    </nav>
    <span class="sr-only" role="status">{district}: {selected.album.title}, {selected.album.sub}</span>
  {:else}<div class="scene-message"><h2>No albums in this space</h2><p>Adjust your library filters to explore another part of the collection.</p><button onclick={onexit}>Return to cover wall</button></div>{/if}
  {#if error}<div class="scene-message" role="alert"><h2>The archive couldn’t render</h2><p>Your albums are still available in the cover wall.</p><button onclick={() => { error = false; ready = false; }}>Try again</button> <button onclick={onexit}>Return to cover wall</button></div>
  {:else if !ready && stations.length}<span class="loading-city" role="status">Lighting the archive…</span>{/if}
</section>

<style>
  .chronocity { position: fixed; inset: var(--scene-top) 0 var(--botbar, 60px); overflow: hidden; background: #06101c; color: #edf5ff; font-family: var(--ui-font); isolation: isolate; }
  .chronocity.concealed { visibility: hidden; pointer-events: none; }
  .chronocity:focus-visible { outline: 2px solid var(--neon); outline-offset: -3px; }
  .chronocity ::selection { color: #06101c; background: #b1dce7; }
  .world, .vignette { position: absolute; inset: 0; } .world { touch-action: none; cursor: grab; } .world:active { cursor: grabbing; }
  .vignette { pointer-events: none; background: linear-gradient(180deg, #06101c44, transparent 24%, transparent 62%, #06101ce8); }
  .city-heading { position: absolute; top: 22px; left: 28px; pointer-events: none; }
  h1 { font-size: 26px; font-weight: 550; letter-spacing: -.03em; line-height: 1; margin: 0; }
  .city-heading p { margin: 8px 0 0; font-size: 12px; color: #c1d1e2; }
  .collection-heading { position: absolute; top: 86px; left: 28px; max-width: min(480px, 80%); padding: 10px 14px; background: #06101cf5; border-radius: 6px; } .collection-heading h2 { font-size: 21px; margin: 8px 0; } .collection-heading p { margin: 5px 0; font-size: 12px; color: #c1d1e2; } .collection-heading .collection-error { color: #ffce9a; }
  .world-options { position: absolute; top: 18px; right: 24px; display: flex; gap: 8px; }
  .cinematic-toggle { position: absolute; top: 72px; right: 24px; display: flex; align-items: center; gap: 8px; }
  .cinematic-toggle[aria-pressed=true] { color: #ffe0a8; border-color: #c29a63; background: #30271cf2; }
  .material-toggle[aria-pressed=true] { color: #dfc6f5; border-color: #aa86c4; }
  .album-console { position: absolute; bottom: 86px; left: 28px; max-width: min(520px, 65%); padding: 12px 16px; box-sizing: border-box; background: #06101cf5; border-radius: 6px; }
  .album-title { display: block; color: #fff5e8; padding: 0; max-width: 100%; text-align: left; font: 550 clamp(20px, 2vw, 28px)/1.15 var(--ui-font); letter-spacing: -.03em; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .album-copy p { margin: 6px 0; font-size: 13px; color: #e2eaf5; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; } .album-meta { font-size: 11px; color: #c1d1e2; }
  .album-actions { margin-top: 12px; display: flex; align-items: center; gap: 8px; }
  button { border: 1px solid #c6d7e04d; background: #0c1a28e6; color: #edf5ff; border-radius: 4px; padding: 8px 12px; font: inherit; font-size: 12px; cursor: pointer; min-height: 40px; }
  .album-title { background: none; border: none; min-height: auto; }
  button:hover { border-color: var(--neon); color: var(--neon); } button:disabled { opacity: .4; cursor: default; }
  :is(button, select):focus-visible { outline: 2px solid var(--neon); outline-offset: 3px; }
  .album-actions :global(.collection-play) { --play-accent: var(--neon); --play-bar: #06101c; font-size: 12px; }
  .availability { font-size: 12px; color: #ffce9a; }
  .route { position: absolute; bottom: 16px; left: 28px; right: 24px; display: flex; align-items: center; gap: 24px; flex-wrap: wrap; }
  .route-controls, .movement { display: flex; align-items: center; gap: 7px; }
  .movement { margin-left: auto; }
  .step, .movement button:has(svg) { display: grid; place-items: center; width: 40px; padding: 0; }
  select { color-scheme: dark; color: #edf5ff; background: #0c1a28; border: 1px solid #c6d7e04d; border-radius: 4px; padding: 8px; min-height: 40px; font: inherit; font-size: 12px; }
  .playlist-jump { max-width: 180px; }
  .route-position { font-size: 11px; color: #c1d1e2; font-variant-numeric: tabular-nums; margin-left: 8px; }
  .instructions { width: 100%; margin: -17px 0 0; font-size: 10px; color: #c1d1e2; }
  .loading-city { position: absolute; top: 94px; left: 28px; font-size: 12px; }
  .scene-message { position: absolute; inset: 20% 24px auto; margin: auto; max-width: 420px; padding: 24px; background: #0c1a28f5; border: 1px solid #c6d7e04d; z-index: 2; }
  .scene-message h2 { margin: 0 0 12px; font-size: 24px; } .scene-message p { font-size: 14px; line-height: 1.5; color: #c1d1e2; }
  .sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; border: 0; }
  @media (max-width: 700px) {
    .city-heading { top: 18px; left: 16px; } h1 { font-size: 20px; } .city-heading p { display: none; }
    .collection-heading { top: 92px; left: 16px; right: 16px; max-width: none; padding: 8px 12px; display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 6px 12px; align-items: center; } .collection-heading h2 { font-size: 16px; line-height: 20px; margin: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; } .collection-heading p { margin: 0; } .collection-heading .collection-error { grid-column: 1 / -1; }
    .cinematic-toggle { top: 0; right: 12px; min-height: 44px; padding: 6px 9px; font-size: 11px; }
    .world-options { top: 44px; right: 12px; gap: 5px; } .world-options button { font-size: 11px; padding: 7px 9px; }
    .album-console { left: 16px; right: 16px; max-width: none; bottom: 138px; } .album-title { font-size: 20px; } .album-copy p { font-size: 12px; }
    button, .album-actions :global(button), select { min-height: 44px; } .album-actions { gap: 6px; margin-top: 9px; } .album-actions button { padding: 8px 10px; }
    .route { left: 16px; right: 16px; bottom: 12px; gap: 10px; } .route-controls { width: 100%; } .route-position { margin-left: auto; }
    .movement { margin-left: 0; gap: 7px; } .step, .movement button:has(svg) { width: 44px; } .instructions { display: none; }
  }
</style>
