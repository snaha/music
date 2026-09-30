<script lang="ts">
  import { untrack } from 'svelte';
  import { Spring } from 'svelte/motion';
  import { addCollection, library, MODES, setMode, type Mode, type Tile } from './library.svelte';
  import { spotify } from './spotify.svelte';
  import { player } from './player.svelte';
  import { session } from './api.svelte';
  import Side from './Side.svelte';
  import CollectionDetails from './CollectionDetails.svelte';
  import Settings from './Settings.svelte';
  import Visualizer from './Visualizer.svelte';
  import { bg, importBackground, MATERIALS, randomBackground } from './background.svelte';

  let { tiles, onpick, activeId, hidden }: { tiles: Tile[]; onpick: (t: Tile) => void; activeId?: string; hidden: boolean } = $props();

  // Tile styling from Figma "Frame 2" (3312px wide): 48px gaps, 16px radius, shadows. Sizes are in design
  // units (--u = 100vw / 3312) so they scale with the window; the grid itself is full width.
  let cols = $state(Number(localStorage.getItem('grid.cols')) || 3);
  let gap = $state(Number(localStorage.getItem('grid.gap') ?? 48));
  let art = $state(localStorage.getItem('art') !== '0');
  let motion = $state(localStorage.getItem('motion') === '1'); // off by default
  // which set of controls the top bar shows
  const SETS = { layout: 'Layout', look: 'Look', search: 'Search', sources: 'Sources' } as const;
  let set = $state((localStorage.getItem('set') as keyof typeof SETS) || 'layout');
  library.source = window.spotify ? (['all', 'local', 'spotify'].includes(localStorage.getItem('library.source') ?? '') ? localStorage.getItem('library.source') as typeof library.source : 'all') : 'all';
  library.highlight = localStorage.getItem('library.highlight') === '1';
  $effect(() => {
    localStorage.setItem('grid.cols', String(cols)); localStorage.setItem('grid.gap', String(gap));
    localStorage.setItem('art', art ? '1' : '0'); localStorage.setItem('motion', motion ? '1' : '0');
    localStorage.setItem('set', set);
    localStorage.setItem('library.source', library.source); localStorage.setItem('library.highlight', library.highlight ? '1' : '0');
  });
  let query = $state('');
  let artistFilter = $state('');
  let sort = $state('library');
  let favoritesOnly = $state(false);
  let details = $state<Tile | null>(null);
  let displayControls = $state(false);
  let filterHeight = $state(110);
  $effect(() => { const mode = library.mode; untrack(() => { artistFilter = ''; if (mode === 'playlists' && sort === 'recent') sort = 'library'; }); });
  const modeLabels: Record<Mode, string> = { albums: 'Albums', playlists: 'Playlists' };
  const normalize = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase();
  const collator = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true });
  const sourceTiles = $derived(tiles.filter((t) => library.source === 'all' || t.source === library.source));
  const artists = $derived([...new Set(sourceTiles.filter((t) => t.kind === 'album').map((t) => t.sub).filter(Boolean))].sort(collator.compare));
  const spotifyAlbumCount = $derived(spotify.albums.length);
  const spotifyPlaylistCount = $derived(spotify.collections.filter((t) => t.kind === 'playlist' && t.id !== 'spotify:liked').length);
  const hasLiked = $derived(spotify.collections.some((t) => t.id === 'spotify:liked'));
  let orderKey = '', tileOrder: string[] = [];
  let shown = $derived.by(() => {
    const words = normalize(query).trim().split(/\s+/).filter(Boolean);
    const result = sourceTiles.filter((t) => (!art || t.cover || t.source === 'spotify' || t.id === activeId) &&
      (!favoritesOnly || t.favorite) && (!artistFilter || t.sub === artistFilter) && words.every((word) => normalize(`${t.title} ${t.sub}`).includes(word)));
    if (sort === 'recent') result.sort((a, b) => (b.addedAt ?? '').localeCompare(a.addedAt ?? ''));
    if (sort === 'title') result.sort((a, b) => collator.compare(a.title, b.title));
    if (sort === 'artist') result.sort((a, b) => collator.compare(a.sub, b.sub) || collator.compare(a.title, b.title));
    // Background discovery replaces existing covers in place; new matches append until the next explicit filter/sort.
    const key = JSON.stringify([library.mode, library.source, query, artistFilter, sort, favoritesOnly, art]);
    if (key !== orderKey) { orderKey = key; tileOrder = result.map(t => t.id); }
    else {
      const known = new Set(tileOrder), matches = new Map(result.map(t => [t.id, t]));
      tileOrder = [...tileOrder.filter(id => matches.has(id)), ...result.filter(t => !known.has(t.id)).map(t => t.id)];
      return tileOrder.map(id => matches.get(id)!);
    }
    return result;
  });
  function filterChanged() { scrollTop = 0; details = null; player.queueOpen = false; player.view = ''; leftMenu = false; rightMenu = false; scroller?.scrollTo({ top: 0 }); }
  function changeMode(mode: Mode) { artistFilter = ''; favoritesOnly = false; filterChanged(); void setMode(mode); }
  function changeSource() { artistFilter = ''; filterChanged(); }
  function resetFilters() { query = ''; artistFilter = ''; library.source = 'all'; sort = 'library'; favoritesOnly = false; art = false; filterChanged(); }
  $effect(() => { library.visible = shown; });

  let viewportWidth = $state(innerWidth), viewportHeight = $state(innerHeight), scrollTop = $state(0);
  const pixelGap = $derived(Math.max(0.2, gap * (viewportWidth + (innerWidth - viewportWidth)) / 3312));
  const rowStep = $derived(Math.max(1, (viewportWidth - pixelGap * (cols + 1)) / cols + pixelGap));
  const totalRows = $derived(Math.ceil(shown.length / cols));
  const firstRow = $derived(Math.max(0, Math.min(totalRows, Math.floor((scrollTop - filterHeight - pixelGap) / rowStep) - 2)));
  const lastRow = $derived(Math.min(totalRows, Math.ceil((scrollTop - filterHeight + viewportHeight) / rowStep) + 3));
  const visibleTiles = $derived(shown.slice(firstRow * cols, lastRow * cols));

  // when the playing album changes (random queue, next track), bring its cover into view
  // that scroll is not the user's: on touch it must not show or hide the top bar, so it is ignored until the next touch
  let scroller: HTMLDivElement, autoScroll = false;
  // Playback and background refreshes keep the user's scroll position.

  // subtle whole-grid drift with the mouse; native scroll does the rest
  const drift = new Spring({ x: 0, y: 0 }, { stiffness: 0.05, damping: 0.5 });
  // top bar visibility. Mouse: 0 below the middle of the screen, 1 at the top edge.
  // Touch: hidden by default; scrolling up shows it, and it stays until scrolling down or tapping an album.
  // media query first; a real touch event also switches to touch mode in case the query misreports
  const touchAtLoad = matchMedia('(hover: none), (pointer: coarse)').matches;
  let touch = $state(touchAtLoad);
  let near = $state(touchAtLoad ? 0 : 1);
  let lastTop = 0;
  function ontouchstart() { autoScroll = false; if (!touch) { touch = true; near = 0; } }
  // on touch, a tap while the bars are hidden only brings them back; it must not start a song
  let wasHidden = false;
  function pick(t: Tile) { if (touch) near = 0; if (touch && wasHidden) return; onpick(t); }
  // the drawer view opened from the right menu, if any; it pins the menu open
  let rightView = $derived(player.viewFrom === 'right' ? player.view : '');
  // two corner keys with side panels: modes on the left, control sets (and share) on the right.
  // top bar and side panels are one piece of chrome: same opacity, and hovering any of them lights all
  let overChrome = $state(false);
  let leftMenu = $state(false), leftOpen = $state(false), rightMenu = $state(false), rightOpen = $state(false);
  let panelOpen = $derived(leftOpen || rightOpen);
  // never fade while the pointer rests on the chrome (touch has no resting pointer, only a stale one), or while a panel is open;
  // on touch idling never hides it, scrolling does
  let barShown = $derived(!!rightView || overChrome || panelOpen || !((!touch && hidden) || player.queueOpen || (!touch && player.topHidden)));
  // published sizes so a drawer can fill exactly the space between top bar, side panel and player bar.
  // on touch the panel never takes space: the drawer spans the full width and the panel opens over it
  let barHeight = $state(0), sideWidth = $state(0);
  $effect(() => { document.documentElement.style.setProperty('--topbar', `${filterHeight + (displayControls ? barHeight : 0)}px`); });
  $effect(() => { document.documentElement.style.setProperty('--browsebar', `${filterHeight}px`); });
  $effect(() => { document.documentElement.style.setProperty('--sidebar', `${displayControls && rightOpen && !touch ? sideWidth : 0}px`); });
  let lit = $derived(overChrome || panelOpen);
  // a menu item opens its view beside the panel, or closes it when it is the one showing. With a mouse the menu stays open;
  // on touch it closes so the view gets the whole width
  function open(view: 'share' | 'settings') { player.viewFrom = 'right'; player.view = rightView === view ? '' : view; rightMenu = !touch; }
  let chrome = $derived(lit ? 1 : near);
  function onmove(e: PointerEvent) {
    drift.target = motion ? { x: (e.clientX / innerWidth) * 2 - 1, y: (e.clientY / innerHeight) * 2 - 1 } : { x: 0, y: 0 };
    if (!touch) near = Math.min(1, Math.max(0, 1 - e.clientY / (innerHeight / 2)));
  }
  function onscroll(e: Event) {
    const top = (e.currentTarget as HTMLElement).scrollTop; scrollTop = top;
    if (!touch) return;
    if (!autoScroll && Math.abs(top - lastTop) > 4) near = top < lastTop ? 1 : 0;
    lastTop = top;
  }
</script>

<div class="browse" bind:clientHeight={filterHeight} role="region" aria-label="Library filters">
  <div class="browse-row">
    <div class="view-tabs" role="tablist" aria-label="Library views">
      {#each MODES as mode}<button role="tab" aria-selected={library.mode === mode} onclick={() => changeMode(mode)}>{modeLabels[mode]}</button>{/each}
    </div>
    <label class="browse-search">Search
      <input type="search" aria-label="Search library" placeholder="Album, artist or playlist…" bind:value={query} oninput={filterChanged} onkeydown={(e) => { if (e.key === 'Escape') { query = ''; filterChanged(); } }} autocomplete="off" spellcheck="false" />
    </label>
    <label>Source
      <select aria-label="Filter by source" bind:value={library.source} onchange={changeSource}>
        <option value="all">All sources</option><option value="local">Local</option>
        {#if window.spotify}<option value="spotify">Spotify</option>{/if}
      </select>
    </label>
    {#if library.mode === 'albums'}
      <label>Artist
        <select aria-label="Filter by artist" bind:value={artistFilter} onchange={filterChanged}>
          <option value="">All artists</option>
          {#if artistFilter && !artists.includes(artistFilter)}<option value={artistFilter}>{artistFilter}</option>{/if}
          {#each artists as name}<option value={name}>{name}</option>{/each}
        </select>
      </label>
    {/if}
    <label>Sort
      <select aria-label="Sort library" bind:value={sort} onchange={filterChanged}>
        <option value="library">Library order</option>{#if library.mode === 'albums'}<option value="recent">Recently added</option>{/if}<option value="title">Title A–Z</option><option value="artist">Artist A–Z</option>
      </select>
    </label>
    {#if library.mode === 'albums'}<label class="favorite-filter"><input type="checkbox" bind:checked={favoritesOnly} onchange={filterChanged} /> Local favorites</label>{/if}
    <button class="browse-reset" onclick={resetFilters}>Reset filters</button>
    <button aria-pressed={displayControls} onclick={() => (displayControls = !displayControls)}>Display</button>
    <button onclick={() => { player.viewFrom = 'right'; player.view = player.view === 'settings' ? '' : 'settings'; rightMenu = false; }}>Settings</button>
  </div>
  <div class="browse-summary">
    <span role="status">{shown.length} of {sourceTiles.length} {library.mode === 'playlists' ? 'playlists' : 'albums'}{#if library.loading} · Loading…{/if}</span>
    {#if art}<button onclick={() => { art = false; filterChanged(); }}>Covers only ×</button>{/if}
    {#if window.spotify && spotify.connected}
      <span class="spotify-count">Spotify: {spotifyAlbumCount} albums · {spotifyPlaylistCount} playlists{#if hasLiked} · Liked Songs{/if} · {spotify.indexedTracks} indexed tracks · {spotify.inaccessiblePlaylists} playlists with inaccessible contents</span>
    {/if}
  </div>
</div>

<!-- an image dropped anywhere becomes the custom background -->
<svelte:window onpointermove={onmove} {ontouchstart} onpointerdowncapture={() => (wasHidden = hidden)}
  ondragover={(e) => e.preventDefault()} ondrop={(e) => { e.preventDefault(); const f = e.dataTransfer?.files[0]; if (f) importBackground(f); }} />

<!-- the visualizer as background sits behind everything; the fullscreen one replaces it while open -->
{#if bg.material === 'viz' && !player.visOpen}<Visualizer background />{/if}

<!-- the material sits on the cards' layer so it scrolls and drifts with them, or on the fixed viewport behind them -->
<div class="scroll" style:padding-top="{filterHeight}px" class:fill={!bg.tile} class:m-vinyl={!bg.scroll && bg.material === 'vinyl'} class:m-grille={!bg.scroll && bg.material === 'grille'}
  class:m-fabric={!bg.scroll && bg.material === 'fabric'} class:m-custom={!bg.scroll && bg.material === 'custom'} style:--custom={bg.custom ? `url("${bg.custom}")` : 'none'} {onscroll} bind:this={scroller} bind:clientWidth={viewportWidth} bind:clientHeight={viewportHeight}>
  <div class="grid" class:m-vinyl={bg.scroll && bg.material === 'vinyl'} class:m-grille={bg.scroll && bg.material === 'grille'}
    class:m-fabric={bg.scroll && bg.material === 'fabric'} class:m-custom={bg.scroll && bg.material === 'custom'} style:--cols={cols} style:--gap="max(0.2px, calc({gap} * var(--u)))"
    style:padding-top="{pixelGap + firstRow * rowStep}px" style:padding-bottom="{140 + (totalRows - lastRow) * rowStep}px"
    style:transform="translate3d({drift.current.x * -8}px, {drift.current.y * -6}px, 0)">
    {#each visibleTiles as t (t.id)}
      <div class="tile-wrap" class:source-highlight={library.highlight} class:spotify-tile={t.source === 'spotify'}>
        <button class="tile" disabled={!t.available} class:active={t.id === activeId} onclick={() => pick(t)} aria-label="Play {t.title} — {t.sub} — {t.source}">
          {#if t.cover}<img src={t.cover} alt={t.title} loading="lazy" draggable="false" />{:else}<span class="fallback">{t.title}</span>{/if}
          {#if t.source === 'local'}<i></i>{/if}
        </button>
        <div class="tile-info">
          <span class="tile-title">{t.title}<small>{t.sub}</small><small>{t.indexing ? 'Indexing…' : `${t.count} included track${t.count === 1 ? '' : 's'}`}</small></span>
          <span class="tile-actions">
            {#if t.source === 'spotify' && t.externalUrl}
              <button class="source-link" onclick={() => window.spotify!.external(t.externalUrl!).catch((e) => (player.error = e.message))} aria-label="Open {t.title} in Spotify">Spotify ↗</button>
            {:else if library.highlight}<span class="source-link">Local</span>{/if}
            <button class="details" onclick={() => { details = t; player.queueOpen = false; player.view = ''; }} aria-label="Show tracks in {t.title}" title="Included tracks">☷</button>
            <button class="add" onclick={() => addCollection(t)} disabled={!t.available} aria-label="Add {t.title} to queue" title={t.indexing ? 'Album discovery in progress' : t.available ? 'Add to queue' : 'Spotify does not expose these tracks'}>+</button>
          </span>
        </div>
      </div>
    {/each}
  </div>
</div>

{#if !shown.length && !library.loading && !spotify.syncing}
  <div class="empty-library">
    <p>{library.source === 'spotify' && !spotify.connected ? 'Connect Spotify to see your albums, likes and playlists.' : 'No music in this view.'}</p>
    {#if library.source === 'spotify' && !spotify.connected}<button onclick={() => open('settings')}>Connect Spotify</button>{/if}
  </div>
{/if}

<div class="controls" role="toolbar" tabindex="-1" aria-label="Controls" inert={!displayControls || !barShown} class:hidden={!displayControls || !barShown} style:top="{filterHeight}px" class:lit style:--chrome={chrome} style:pointer-events={displayControls && barShown && chrome > 0.05 ? 'auto' : 'none'}
  bind:clientHeight={barHeight} onpointerenter={() => (overChrome = !touch)} onpointerleave={() => (overChrome = false)}>
  {#if set === 'sources'}
    <span class="group" role="radiogroup" aria-label="Music sources">
      {#each (window.spotify ? ['all', 'local', 'spotify'] : ['all', 'local']) as source}
        <button class="opt" class:on={library.source === source} role="radio" aria-checked={library.source === source} onclick={() => (library.source = source as typeof library.source)}>{source}</button>
      {/each}
    </span>
    <label><input type="checkbox" bind:checked={library.highlight} /> highlight sources</label>
  {:else if set === 'layout'}
    <label>columns <input type="range" min="1" max="10" bind:value={cols} /> {cols}</label>
    <label>gap <input type="range" min="0" max="160" bind:value={gap} /> {gap}</label>
  {:else if set === 'search'}
    <span class="find">
      <input type="text" placeholder="search" bind:value={query} spellcheck="false" autocomplete="off" aria-label="Search"
        onkeydown={(e) => { if (e.key === 'Escape') query = ''; }} {@attach (el) => el.focus()} />
      {#if query}
        <button class="clear" onclick={() => (query = '')} aria-label="Clear search">
          <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
        </button>
      {/if}
    </span>
  {:else}
    <span class="group" role="radiogroup" aria-label="Background">
      <span class="name">background</span>
      {#each Object.entries(MATERIALS) as [key, label] (key)}
        <button class="opt" class:on={bg.material === key} role="radio" aria-checked={bg.material === key} disabled={key === 'custom' && !bg.custom}
          title={key === 'custom' && !bg.custom ? 'import one in settings' : undefined} onclick={() => (bg.material = key as keyof typeof MATERIALS)}>{label}</button>
      {/each}
      <button class="opt" onclick={randomBackground} title="one of the bundled sample backgrounds">random</button>
    </span>
  {/if}
  <!-- left corner: which part of the library the grid shows -->
  <Side side="left" label={library.mode} {touch} bind:menu={leftMenu} bind:open={leftOpen}>
    {#each MODES as m (m)}
      <button role="menuitem" tabindex={leftOpen ? 0 : -1} class:on={library.mode === m} onclick={() => { changeMode(m); leftMenu = false; }}>{m}</button>
    {/each}
  </Side>
  <!-- right corner: which set of controls the bar shows, and the share and settings views -->
  <Side side="right" label={SETS[set]} {touch} pinned={!!rightView && !touch} onunpin={() => (player.view = '')} bind:menu={rightMenu} bind:open={rightOpen} bind:width={sideWidth}>
    {#each Object.entries(SETS) as [key, label] (key)}
      <button role="menuitem" tabindex={rightOpen ? 0 : -1} class:on={set === key} onclick={() => { set = key as keyof typeof SETS; player.view = ''; rightMenu = false; }}>{label}</button>
    {/each}
    <span class="rule"></span>
    {#if session.admin}
      <button role="menuitem" tabindex={rightOpen ? 0 : -1} class:on={rightView === 'share'} onclick={() => open('share')}>Share</button>
    {/if}
    <button role="menuitem" tabindex={rightOpen ? 0 : -1} class:on={rightView === 'settings'} onclick={() => open('settings')}>Settings</button>
  </Side>
</div>

{#if library.scan.scanning}<div class="scan">indexing… {library.scan.count} songs</div>{/if}
{#if spotify.syncing || spotify.indexing || library.loading}<div class="library-status" role="status">{spotify.syncing || spotify.indexing ? spotify.progress : 'Loading music…'}</div>{/if}
{#if spotify.indexError}<div class="library-status" role="alert">Album discovery paused: {spotify.indexError} Refresh Spotify in Settings to retry.</div>{/if}
{#if library.mode === 'playlists' && spotify.inaccessiblePlaylists > 0}<p class="playlist-note">Spotify does not expose some playlists’ tracks. Their covers remain visible, but those tracks cannot contribute albums.</p>{/if}
{#if details}<CollectionDetails tile={details} onclose={() => (details = null)} />{/if}
{#if library.error}<div class="library-status" role="alert">{library.error}</div>{/if}

{#if player.view === 'settings'}<Settings bind:art bind:motion onclose={() => (player.view = '')} />{/if}

<style>
  .view-tabs { display: flex; gap: 4px; }
  .view-tabs button[aria-selected=true] { background: #eee; color: #151517; }
  .browse .favorite-filter { flex-direction: row; align-items: center; align-self: center; }
  .browse .favorite-filter input { width: 16px; min-height: 16px; }
  .playlist-note { position: fixed; bottom: 110px; left: 16px; max-width: 650px; padding: 8px 12px; background: #111e; color: #bbb; font: 12px/1.5 system-ui; pointer-events: none; }
  .browse { position: fixed; inset: 0 0 auto; z-index: 3; box-sizing: border-box; padding: 14px 20px 10px; color: #eee; background: #151517f5; border-bottom: 1px solid #ffffff1c; font: 13px/1.4 system-ui, sans-serif; }
  .browse-row { display: flex; align-items: end; gap: 12px; flex-wrap: wrap; }
  .browse label { display: flex; flex-direction: column; gap: 4px; color: #aaa; min-width: 0; }
  .browse input, .browse select, .browse button { font: inherit; color: #eee; background: #26262a; border: 1px solid #ffffff26; border-radius: 7px; padding: 8px 10px; min-height: 36px; box-sizing: border-box; }
  .browse select { max-width: 210px; cursor: pointer; }
  .browse-search { flex: 1; min-width: 200px !important; max-width: 440px; }
  .browse input { width: 100%; }
  .browse button { cursor: pointer; white-space: nowrap; }
  .browse button:hover, .browse button[aria-pressed=true] { border-color: #aaa; background: #39393e; }
  .browse :is(input, select, button):focus-visible { outline: 2px solid #b0d8ff; outline-offset: 2px; }
  .browse-summary { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; margin-top: 9px; color: #aaa; font-size: 12px; }
  .browse-summary button { padding: 1px 7px; min-height: 22px; font-size: 11px; }
  .spotify-count { margin-left: auto; }
  @media (max-width: 700px) {
    .browse { padding: 10px 12px; }
    .browse-row { gap: 8px; }
    .browse label { flex: 1 1 100px; }
    .browse-search { order: -1; flex-basis: 100% !important; max-width: none; }
    .browse select { max-width: 100%; width: 100%; }
    .browse button { min-height: 40px; }
    .spotify-count { margin-left: 0; }
  }

  .empty-library { position: fixed; inset: 35% 10% auto; text-align: center; color: #bbb; font-size: 18px; }
  .empty-library button { color: white; background: #222; border: 1px solid #777; border-radius: 4px; padding: 12px 18px; cursor: pointer; }
  .tile-wrap { position: relative; aspect-ratio: 1; min-width: 0; }
  .tile-wrap .tile { display: block; width: 100%; height: 100%; }
  .tile-info { position: absolute; bottom: 0; left: 0; right: 0; display: flex; flex-direction: column; align-items: stretch; gap: 5px; padding: 8px; background: linear-gradient(transparent, #000d); color: white; pointer-events: none; font-size: clamp(11px, 1vw, 16px); }
  .tile-title { min-width: 0; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; text-shadow: 0 1px 3px #000; }
  .tile-title small { display: block; opacity: .75; overflow: hidden; text-overflow: ellipsis; }
  .tile-actions { display: flex; justify-content: flex-end; align-items: center; gap: 6px; pointer-events: auto; }
  .tile-info button { color: white; border: 1px solid #fff5; border-radius: 4px; background: #111c; cursor: pointer; padding: 5px; }
  .tile-info button:disabled { opacity: .4; cursor: default; }
  .source-link { font-size: 11px; white-space: nowrap; }
  .add { font-size: 20px; width: 30px; height: 30px; line-height: 16px; }
  .source-highlight { outline: 2px solid #999; outline-offset: -2px; }
  .source-highlight.spotify-tile { outline-color: #1db954; }
  .source-highlight .tile-actions { background: #222; border-radius: 4px; }
  .source-highlight.spotify-tile .tile-actions { background: #145e31; }
  .fallback { display: grid; place-items: center; height: 100%; padding: 20px; box-sizing: border-box; color: #ddd; background: linear-gradient(145deg, #253948, #111); }
  .library-status { position: fixed; left: 16px; bottom: 110px; padding: 8px 12px; color: #ddd; background: #111e; z-index: 2; font-size: 13px; }
  .scroll {
    --u: calc(100vw / 3312); position: fixed; inset: 0; overflow-y: auto; overflow-x: hidden; scrollbar-width: thin; scrollbar-color: #333 #000; scrollbar-gutter: stable both-edges;
    /* built-in materials: each is grain + a structure + the same two diagonal light bands */
    --grain: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 0.09 0'/%3E%3C/filter%3E%3Crect width='200' height='200' filter='url(%23n)'/%3E%3C/svg%3E") 0 0 / 200px 200px;
    --sheen: repeating-linear-gradient(105deg, #fff0 0, #ffffff0a 160px, #ffffff16 270px, #ffffff0a 380px, #fff0 520px,
        #fff0 780px, #ffffff0a 920px, #ffffff16 1030px, #ffffff0a 1140px, #fff0 1300px, #fff0 1400px);
  }
  .grid { display: grid; grid-template-columns: repeat(var(--cols), 1fr); gap: var(--gap); padding: var(--gap) var(--gap) 140px; min-height: 100%; box-sizing: border-box; will-change: transform; }
  /* custom: the imported image as authored, repeated at its own size or stretched to cover */
  .m-custom { background: var(--custom) center / auto repeat #000; }
  .fill .m-custom, .fill.m-custom { background-size: cover; background-repeat: no-repeat; }
  /* vinyl: pressed hairline grooves */
  .m-vinyl { background: var(--grain), repeating-linear-gradient(to bottom, #fff0 0 2px, #00000033 2px 3px, #ffffff06 3px 4px), var(--sheen); }
  /* grille: perforated gunmetal, staggered round holes with a lit top edge, brushed base */
  .m-grille {
    background:
      var(--grain),
      radial-gradient(circle at 50% 50%, #000 0 2px, #ffffff10 2.3px 2.7px, #0000 3px) 0 0 / 9px 15.6px,
      radial-gradient(circle at 50% 50%, #000 0 2px, #ffffff10 2.3px 2.7px, #0000 3px) 4.5px 7.8px / 9px 15.6px,
      repeating-linear-gradient(to right, #ffffff05 0 1px, #0000 1px 3px),
      var(--sheen),
      linear-gradient(#1c1c1c, #151515);
  }
  /* fabric: fine crosshatch weave with a soft nap */
  .m-fabric {
    background:
      var(--grain),
      repeating-linear-gradient(45deg, #ffffff07 0 1px, #0000 1px 4px),
      repeating-linear-gradient(-45deg, #ffffff07 0 1px, #0000 1px 4px),
      repeating-linear-gradient(to bottom, #00000030 0 1px, #0000 1px 4px),
      var(--sheen),
      linear-gradient(#141414, #0e0e0e);
  }
  .tile {
    all: unset; position: relative; cursor: pointer; aspect-ratio: 1; background: #111;
    border-radius: 1px; overflow: hidden;
    box-shadow: 0 3px 5px -2px rgba(0, 0, 0, 0.8); /* light from top: shadow below only */
    transition: transform 200ms cubic-bezier(.2,.8,.2,1), box-shadow 200ms;
  }
  /* alt text stays for screen readers but is not painted in the browser's default style when a cover fails */
  .tile img { width: 100%; height: 100%; object-fit: cover; display: block; user-select: none; color: transparent; font-size: 0; }
  /* glossy vinyl-paper sleeve: paper grain, a broad laminate reflection with a faint second band,
     faint lit top-left edge and shaded bottom-right edge */
  .tile i { position: absolute; inset: 0; border-radius: inherit; pointer-events: none;
    background:
      url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='1.1' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 0.05 0'/%3E%3C/filter%3E%3Crect width='160' height='160' filter='url(%23n)'/%3E%3C/svg%3E") 0 0 / 160px 160px,
      linear-gradient(115deg, #fff0 0%, #fff0 18%, rgba(255, 255, 255, 0.11) 30%, rgba(255, 255, 255, 0.04) 42%, #fff0 50%,
        #fff0 62%, rgba(255, 255, 255, 0.06) 70%, #fff0 78%),
      linear-gradient(165deg, rgba(255, 255, 255, 0.10) 0%, #fff0 40%, rgba(0, 0, 0, 0.10) 100%);
    box-shadow:
      inset 1px 1px 0 rgba(255, 255, 255, 0.07),
      inset -1px -1px 0 rgba(0, 0, 0, 0.2);
    transition: opacity 200ms; }
  .tile:hover, .tile:focus-visible { z-index: 1;
    box-shadow: 0 6px 8px -3px rgba(0, 0, 0, 0.85); }
  .tile:hover i { opacity: .7; }
  .tile.active { box-shadow: 0 0 0 2px #fff, 0 0 50px #fff5; }
  .controls {
    /* sizes scale with the viewport between phone and desktop */
    --s: clamp(0.5px, 100vw / 1600, 1px);
    /* one fixed height for every control set so switching never jumps; --bar-rows scales it (2, 3 …) later */
    --bar-rows: 1;
    position: fixed; top: 0; left: 0; right: 0; box-sizing: border-box; min-height: calc(96 * var(--s) * var(--bar-rows));
    display: flex; flex-wrap: wrap; justify-content: center; align-items: center; align-content: center;
    gap: calc(12 * var(--s)) calc(36 * var(--s));
    color: #fff; font-size: calc(24 * var(--s));
    padding: calc(8 * var(--s)) calc(20 * var(--s)); background: rgba(0, 0, 0, 0.6);
    letter-spacing: .08em; text-transform: uppercase; opacity: var(--chrome, 1); user-select: none;
    transition: opacity 150ms, background 200ms; z-index: 2;
  }
  .controls.lit { background: rgba(0, 0, 0, 0.78); } /* a bit darker while hovered or a panel is open */
  @media (hover: none), (pointer: coarse) { .controls { transition: opacity 450ms, background 200ms; } }
  .controls.hidden { opacity: 0; pointer-events: none; }
  /* scan progress while navidrome indexes the folder (first run, new files) */
  .scan { position: fixed; left: 50%; bottom: 130px; transform: translateX(-50%); padding: 8px 16px; border-radius: 4px;
    background: rgba(0, 0, 0, 0.7); color: #fff; font-size: 14px; letter-spacing: .12em; text-transform: uppercase; pointer-events: none; z-index: 2; }
  .controls label { display: flex; align-items: center; gap: calc(16 * var(--s)); }
  /* look set: a row of labelled options */
  .group { display: flex; align-items: center; gap: calc(10 * var(--s)); }
  .name { margin-right: calc(8 * var(--s)); opacity: .7; }
  .controls .opt { all: unset; cursor: pointer; padding: calc(4 * var(--s)) calc(12 * var(--s)); border: 1px solid #fff5; border-radius: 3px; opacity: .6; }
  .controls .opt:hover { opacity: 1; }
  .controls .opt:disabled { opacity: .25; cursor: default; }
  .controls .opt.on { opacity: 1; background: #fff; color: #000; border-color: #fff; }
  /* search set: bare underlined field with a white caret; the clear key appears once there is text */
  .find { position: relative; display: flex; align-items: center; }
  .controls input[type=text] {
    width: calc(420 * var(--s)); height: auto; padding: calc(6 * var(--s)) calc(36 * var(--s)) calc(6 * var(--s)) 0;
    border: 0; border-bottom: 1px solid #fff6; border-radius: 0; background: none; color: #fff; caret-color: #fff;
    font: inherit; letter-spacing: inherit; text-transform: none; outline: none; cursor: text; transition: border-color 150ms;
  }
  .controls input[type=text]:focus { border-bottom-color: #fff; }
  .controls input[type=text]::placeholder { color: #fff6; text-transform: uppercase; }
  .controls .clear { all: unset; cursor: pointer; position: absolute; right: 0; display: flex; padding: calc(6 * var(--s)); opacity: .6; }
  .controls .clear:hover { opacity: 1; }
  /* same thin slider in every browser; Firefox's default range is large */
  .controls input { appearance: none; width: calc(240 * var(--s)); height: calc(32 * var(--s)); margin: 0; background: none; cursor: pointer; }
  .controls input::-webkit-slider-runnable-track { height: 4px; background: #fff6; }
  .controls input::-moz-range-track { height: 4px; background: #fff6; }
  .controls input::-webkit-slider-thumb { appearance: none; width: calc(24 * var(--s)); height: calc(24 * var(--s));
    margin-top: calc(2px - 12 * var(--s)); border-radius: 50%; background: #fff; }
  .controls input::-moz-range-thumb { width: calc(24 * var(--s)); height: calc(24 * var(--s)); border: 0; border-radius: 50%; background: #fff; }
  /* phones: the first row holds just the two corner keys, the controls sit in rows below. Every row is one bar unit
     (96): each control is --h tall with the rest of the unit between rows, so controls that don't fit add a whole unit */
  @media (max-width: 700px) {
    .controls { --h: calc(44 * var(--s)); --row-gap: calc(96 * var(--s) - var(--h));
      padding: calc(96 * var(--s) + var(--row-gap) / 2) calc(20 * var(--s)) calc(var(--row-gap) / 2); row-gap: var(--row-gap); }
    .controls label, .find, .group > * { height: var(--h); box-sizing: border-box; }
    .group { flex-wrap: wrap; justify-content: center; row-gap: var(--row-gap); }
    .controls .opt { display: flex; align-items: center; height: var(--h); box-sizing: border-box; } /* its all: unset drops the rule above */
  }
</style>
