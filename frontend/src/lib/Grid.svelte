<script lang="ts">
  import { keyboardScope } from './keyboard';
  import { onDestroy, untrack } from 'svelte';
  import Icon from './ui/icon.svelte';
  import Button from './ui/button.svelte';
  import Slider from './ui/slider.svelte';
  import { toolbar } from './ui-style.svelte';
  import LibrarySelect from './ui/library-select.svelte';
  import ComponentStyles from './ComponentStyles.svelte';
  import noiseBackground from './noise-background.svg';
  import { Spring } from 'svelte/motion';
  import { addCollection, library, MODES, setMode, type Mode, type Tile } from './library.svelte';
  import { spotify, spotifyPlayable, spotifyDimmed, spotifyMessage, spotifyRecoveryLabel, checkSpotify } from './spotify.svelte';
  import { player } from './player.svelte';
  import CollectionDetails from './CollectionDetails.svelte';
  import Settings from './Settings.svelte';
  import Visualizer from './Visualizer.svelte';
  import { bg, importBackground, MATERIALS, randomBackground } from './background.svelte';

  let { tiles, onpick, activeId, hidden }: { tiles: Tile[]; onpick: (t: Tile) => void; activeId?: string; hidden: boolean } = $props();

  // Tile styling from Figma "Frame 2" (3312px wide): 48px gaps, 16px radius, shadows. Sizes are in design
  // units (--u = 100vw / 3312) so they scale with the window; the grid itself is full width.
  let cols = $state(Number(localStorage.getItem('grid.cols')) || 3);
  let advancedLayout = $state(false);
  function resizeGrid(value: number) { cols = 11 - value; gap = Math.round(24 + cols * 8); }
  let gap = $state(Number(localStorage.getItem('grid.gap') ?? 48));
  let art = $state(localStorage.getItem('art') !== '0');
  let motion = $state(localStorage.getItem('motion') === '1'); // off by default
  type BarMode = 'library' | 'filters' | 'layout' | 'look' | 'theme';
  function closeModes() {
    if (document.activeElement?.matches(':focus-visible')) document.querySelector<HTMLButtonElement>('[aria-label="Choose toolbar mode"]')?.focus();
    toolbar.selecting = false;
  }
  function showMode(mode: BarMode) { toolbar.mode = mode; player.view = ''; closeModes(); }
  function backToSelector() { player.view = ''; toolbar.selecting = true; requestAnimationFrame(() => document.querySelector<HTMLButtonElement>('.mode-options button[aria-pressed=true]')?.focus()); }
  library.source = window.spotify ? (['all', 'local', 'spotify'].includes(localStorage.getItem('library.source') ?? '') ? localStorage.getItem('library.source') as typeof library.source : 'all') : 'all';
  library.highlight = localStorage.getItem('library.highlight') === '1';
  $effect(() => {
    localStorage.setItem('grid.cols', String(cols)); localStorage.setItem('grid.gap', String(gap));
    localStorage.setItem('art', art ? '1' : '0'); localStorage.setItem('motion', motion ? '1' : '0');
    localStorage.setItem('library.source', library.source); localStorage.setItem('library.highlight', library.highlight ? '1' : '0');
  });
  let query = $state('');
  let artistFilter = $state('');
  let sort = $state('library');
  let favoritesOnly = $state(false);
  let details = $state<Tile | null>(null);
  const filtersOpen = $derived(toolbar.mode === 'filters');
  let discoveryId = $state('');
  const activeFilters = $derived(Number(library.source !== 'all') + Number(!!artistFilter) + Number(sort !== 'library') + Number(favoritesOnly));
  function discover() {
    const candidates = shown.filter(t => t.id !== discoveryId);
    if (!candidates.length) return;
    const tile = candidates[Math.floor(Math.random() * candidates.length)];
    discoveryId = tile.id;
    const index = shown.findIndex(t => t.id === tile.id);
    scroller?.scrollTo({ top: Math.floor(index / effectiveCols) * rowStep, behavior: 'instant' });
  }
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
  function filterChanged() { scrollTop = 0; details = null; player.queueOpen = false; player.view = ''; scroller?.scrollTo({ top: 0 }); }
  function changeMode(mode: Mode) { artistFilter = ''; favoritesOnly = false; filterChanged(); void setMode(mode); }
  function changeSource() { artistFilter = ''; filterChanged(); }
  function resetFilters() { query = ''; artistFilter = ''; library.source = 'all'; sort = 'library'; favoritesOnly = false; art = false; filterChanged(); }
  $effect(() => { library.visible = shown; });

  let viewportWidth = $state(innerWidth), viewportHeight = $state(innerHeight), scrollTop = $state(0);
  const pixelGap = $derived(Math.max(0.2, gap * (viewportWidth + (innerWidth - viewportWidth)) / 3312));
  const effectiveCols = $derived(Math.min(cols, Math.max(1, Math.floor(viewportWidth / 140))));
  const rowStep = $derived(Math.max(1, (viewportWidth - pixelGap * (effectiveCols + 1)) / effectiveCols + pixelGap));
  const totalRows = $derived(Math.ceil(shown.length / effectiveCols));
  const firstRow = $derived(Math.max(0, Math.min(totalRows, Math.floor((scrollTop - pixelGap) / rowStep) - 2)));
  const lastRow = $derived(Math.min(totalRows, Math.ceil((scrollTop + viewportHeight) / rowStep) + 3));
  const visibleTiles = $derived(shown.slice(firstRow * effectiveCols, lastRow * effectiveCols));

  let scroller: HTMLDivElement;
  // Playback and background refreshes keep the user's scroll position.

  // subtle whole-grid drift with the mouse; native scroll does the rest
  const drift = new Spring({ x: 0, y: 0 }, { stiffness: 0.05, damping: 0.5 });
  // Both bars follow the app's idle timer. Hover, keyboard focus and open menus keep the top visible.
  const touchAtLoad = matchMedia('(hover: none), (pointer: coarse)').matches;
  let touch = $state(touchAtLoad);
  function ontouchstart() { touch = true; }
  // The first touch on hidden chrome wakes it without starting playback.
  let wasHidden = false;
  function pick(t: Tile) { if (touch && wasHidden) return; onpick(t); }
  let rightView = $derived(player.viewFrom === 'right' ? player.view : '');
  let overBrowse = $state(false);
  let controlsFocused = $state(false);
  let pointerNearTop = $state(true), pointerObserved = $state(false), scrollRevealed = $state(false);
  let scrollRevealTimer: ReturnType<typeof setTimeout> | undefined;
  let leaveTimer: ReturnType<typeof setTimeout> | undefined;
  const barShown = $derived(toolbar.selecting || toolbar.mode !== 'library' || controlsFocused || !!rightView || overBrowse || scrollRevealed || (!touch && pointerObserved && pointerNearTop) || (!hidden && !player.topHidden && (touch || pointerNearTop)));
  $effect(() => { if (!barShown) toolbar.selecting = false; });
  $effect(() => { document.documentElement.style.setProperty('--topbar', `${filterHeight}px`); });
  $effect(() => { document.documentElement.style.setProperty('--browsebar', `${barShown ? filterHeight : 0}px`); });
  $effect(() => { document.documentElement.style.setProperty('--sidebar', '0px'); });
  function chromeFocus(target: EventTarget | null) {
    controlsFocused = target instanceof Element && !!target.closest('.browse, .library-select-menu') && target.matches(':focus-visible');
    if (target instanceof Element && target.matches('[aria-label="Search library"]')) toolbar.mode = 'library';
  }
  function open(view: 'settings') { player.viewFrom = 'right'; player.view = rightView === view ? '' : view; closeModes(); }
  function onmove(e: PointerEvent) {
    if (e.pointerType !== 'touch') {
      touch = false;
      pointerObserved = true;
      const near = e.clientY <= (barShown ? filterHeight + 28 : 48);
      if (near) { clearTimeout(leaveTimer); leaveTimer = undefined; pointerNearTop = true; }
      else if (!leaveTimer && pointerNearTop) leaveTimer = setTimeout(() => { pointerNearTop = false; leaveTimer = undefined; }, 220);
    }
    drift.target = motion ? { x: (e.clientX / innerWidth) * 2 - 1, y: (e.clientY / innerHeight) * 2 - 1 } : { x: 0, y: 0 };
  }
  function revealAtTop() {
    scrollRevealed = true;
    clearTimeout(scrollRevealTimer);
    scrollRevealTimer = setTimeout(() => (scrollRevealed = false), 1800);
  }
  onDestroy(() => { clearTimeout(leaveTimer); clearTimeout(scrollRevealTimer); });
  function onscroll(e: Event) {
    const next = (e.currentTarget as HTMLElement).scrollTop;
    if (next < scrollTop && next <= 4) revealAtTop();
    scrollTop = next;
  }
</script>

<div class="browse" class:hidden={!barShown} class:selecting={toolbar.selecting}
  onpointerenter={(e) => (overBrowse = e.pointerType === 'mouse')} onpointerleave={() => (overBrowse = false)} bind:clientHeight={filterHeight} role="region" aria-label="Library toolbar">
  <nav class="bar-modes" class:expanded={toolbar.selecting} aria-label="Toolbar modes"
    use:keyboardScope={(e) => {
    if (e.key === 'Escape' && toolbar.selecting) { e.preventDefault(); e.stopPropagation(); toolbar.mode = 'library'; toolbar.selecting = false; document.querySelector<HTMLButtonElement>('[aria-label="Choose toolbar mode"]')?.focus(); toolbar.selecting = false; return; }
    if (e.key === 'ArrowDown' && (e.target as HTMLElement).closest('[aria-label="Choose toolbar mode"]')) { e.preventDefault(); e.stopPropagation(); toolbar.selecting = true; requestAnimationFrame(() => document.querySelector<HTMLButtonElement>('.mode-options button')?.focus()); return; }
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
    e.preventDefault(); e.stopPropagation();
    const buttons = [...(e.currentTarget as HTMLElement).querySelectorAll<HTMLButtonElement>('.mode-options button')];
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const next = e.key === 'Home' ? 0 : e.key === 'End' ? buttons.length - 1 : (index + (e.key === 'ArrowRight' ? 1 : -1) + buttons.length) % buttons.length;
    buttons[next]?.focus();
  }}>
    <Button variant="ghost" size="icon" aria-label="Choose toolbar mode" aria-expanded={toolbar.selecting} aria-controls="toolbar-mode-options" title="Toolbar modes" onclick={() => (toolbar.selecting = !toolbar.selecting)}><Icon name="display" /></Button>
    <div class="mode-options" id="toolbar-mode-options" inert={!toolbar.selecting}>
    {#each [['library', 'Library'], ['filters', 'Filters'], ['layout', 'Layout'], ['look', 'Background'], ['theme', 'Theme']] as [mode, label]}
      <button aria-label={label === 'Filters' ? 'Library filters' : label} aria-pressed={toolbar.mode === mode} onclick={() => showMode(mode as BarMode)}>{label}{mode === 'filters' && activeFilters ? ` · ${activeFilters}` : ''}</button>
    {/each}
    <Button variant="ghost" size="icon" aria-label="Settings" aria-pressed={player.view === 'settings'} title="Settings" onclick={() => open('settings')}><Icon name="settings" /><span>Settings</span></Button>
    </div>
  </nav>
  {#if toolbar.mode !== 'library' && !toolbar.selecting}<button class="back-library" aria-label="Back to toolbar selector" title="Back to toolbar selector" onclick={backToSelector}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m14 6-6 6 6 6M8 12h12" /></svg><span>Back</span></button>{/if}
  <div class="bar-content" hidden={toolbar.selecting} inert={toolbar.selecting}>
  <div class="browse-row" hidden={toolbar.mode !== 'library'} inert={toolbar.mode !== 'library'}>
    <div class="view-tabs" role="tablist" aria-label="Library views" use:keyboardScope={(e) => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
      e.preventDefault(); e.stopPropagation();
      const buttons = [...(e.currentTarget as HTMLElement).querySelectorAll<HTMLButtonElement>('button')];
      const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
      const next = e.key === 'Home' ? 0 : e.key === 'End' ? buttons.length - 1 : (index + (e.key === 'ArrowRight' ? 1 : -1) + buttons.length) % buttons.length;
      buttons[next]?.focus(); buttons[next]?.click();
    }}>
      {#each MODES as mode}<button role="tab" tabindex={library.mode === mode ? 0 : -1} aria-selected={library.mode === mode} onclick={() => changeMode(mode)}>{modeLabels[mode]}</button>{/each}
    </div>
    <label class="browse-search"><span class="filter-caption">Search</span>
      <input type="search" aria-label="Search library" placeholder="Album, artist or playlist…" bind:value={query} oninput={filterChanged} onkeydown={(e) => { if (e.key === 'Escape' && query) { e.preventDefault(); e.stopPropagation(); query = ''; filterChanged(); } }} aria-keyshortcuts="/ Control+k Meta+k" autocomplete="off" spellcheck="false" />
    </label>
    <button class="discovery-action" onclick={discover} disabled={!shown.length} title="Find an album in this view"><Icon name="shuffle" /> <span>Surprise me</span></button>
  </div>
  {#if filtersOpen}<div id="browse-filters" class="filter-tray" aria-label="Refine library">
    <label class="compact-filter"><span class="filter-caption">Source</span>
      <LibrarySelect label="Filter by source" bind:value={library.source} onchange={changeSource} options={[{ value: 'all', label: 'All sources' }, { value: 'local', label: 'Local' }, ...(window.spotify ? [{ value: 'spotify', label: 'Spotify' }] : [])]} />
    </label>
    {#if library.mode === 'albums'}
      <label class="compact-filter"><span class="filter-caption">Artist</span>
        <LibrarySelect label="Filter by artist" bind:value={artistFilter} onchange={filterChanged} options={[{ value: '', label: 'All artists' }, ...[...new Set([...(artistFilter ? [artistFilter] : []), ...artists])].map(name => ({ value: name, label: name }))]} />
      </label>
    {/if}
    <label class="compact-filter"><span class="filter-caption">Sort</span>
      <LibrarySelect label="Sort library" bind:value={sort} onchange={filterChanged} options={[{ value: 'library', label: 'Library order' }, ...(library.mode === 'albums' ? [{ value: 'recent', label: 'Recently added' }] : []), { value: 'title', label: 'Title A–Z' }, { value: 'artist', label: 'Artist A–Z' }]} />
    </label>
    <div class="filter-actions" role="group" aria-label="Filter actions">
      {#if library.mode === 'albums'}<Button variant="ghost" size="sm" aria-pressed={favoritesOnly} aria-label="Local favorites" title="Local favorites" onclick={() => { favoritesOnly = !favoritesOnly; filterChanged(); }}><Icon name="star" /></Button>{/if}
      {#if query || artistFilter || library.source !== 'all' || sort !== 'library' || favoritesOnly || art}<Button variant="ghost" size="sm" aria-label="Reset filters" title="Reset filters" onclick={resetFilters}><Icon name="reset" /></Button>{/if}
      <div class="library-info">
        <button class="info-trigger" aria-label="Library details" title="Library details"><Icon name="info" /></button>
        <div class="library-details" role="status">
          <p>{shown.length} of {sourceTiles.length} {library.mode === 'playlists' ? 'playlists' : 'albums'}{library.loading ? ' · Loading…' : ''}</p>
          {#if art}<button onclick={() => { art = false; filterChanged(); }}>Show albums without artwork</button>{/if}
          {#if window.spotify && spotify.connected}<p>Spotify: {spotifyAlbumCount} albums · {spotifyPlaylistCount} playlists{hasLiked ? ' · Liked Songs' : ''}</p><p>{spotify.indexedTracks} indexed tracks · {spotify.inaccessiblePlaylists} playlists with inaccessible contents</p>{/if}
        </div>
      </div>
    </div>
  </div>{/if}
  {#if toolbar.mode === 'layout' || toolbar.mode === 'look'}
  <div id="display-controls" class="controls" role="region" aria-label="Display options">
    {#if toolbar.mode === 'layout'}
      {#if advancedLayout}
        <label class="slider-control"><span>Columns</span> <Slider type="single" min={1} max={10} step={1} value={cols} onValueChange={(value) => (cols = value)} aria-label="Album columns" /> <output>{cols}</output></label>
        <label class="slider-control"><span>Gap</span> <Slider type="single" min={0} max={160} step={1} value={gap} onValueChange={(value) => (gap = value)} aria-label="Album spacing" /> <output>{gap}</output></label>
      {:else}
        <label class="grid-size"><span>Grid size</span> <span class="grid-size-track"><Slider type="single" min={1} max={10} step={1} value={11 - cols} onValueChange={resizeGrid} aria-label="Grid size" /></span><span>{effectiveCols} across</span></label>
      {/if}
      <Button variant="outline" size="sm" aria-pressed={advancedLayout} onclick={() => (advancedLayout = !advancedLayout)}>{advancedLayout ? 'Simple' : 'Advanced'}</Button>
    {:else}
      <span class="group" role="radiogroup" aria-label="Background">
          {#each Object.entries(MATERIALS) as [key, label] (key)}
          <button class="opt" class:on={bg.material === key} role="radio" aria-checked={bg.material === key} disabled={key === 'custom' && !bg.custom}
            title={key === 'custom' && !bg.custom ? 'import one in settings' : undefined} onclick={() => (bg.material = key as keyof typeof MATERIALS)}>{label}</button>
        {/each}
        <button class="opt" onclick={randomBackground} title="one of the bundled sample backgrounds">Random</button>
      </span>
      <label><input type="checkbox" bind:checked={library.highlight} /> Highlight sources</label>
    {/if}
  </div>
  {/if}
  {#if toolbar.mode === 'theme'}<ComponentStyles />{/if}
  </div>
  {#if window.spotify && !spotifyPlayable()}
    <div class="spotify-availability" role="status">
      <span title={spotifyMessage()}>{spotifyMessage()}</span>
      <button style:visibility={spotifyPlayable() ? 'hidden' : 'visible'} disabled={spotifyPlayable()} onclick={() => spotify.availability === 'offline' || spotify.availability === 'checking' ? checkSpotify(true) : open('settings')}>{spotifyRecoveryLabel()}</button>
    </div>
  {/if}
</div>

<!-- an image dropped anywhere becomes the custom background -->
<svelte:window onkeydown={e => {
  if (e.key !== 'Escape' || e.defaultPrevented || player.view || player.queueOpen || player.visOpen) return;
  if (details) details = null;
  else if (toolbar.mode !== 'library') { backToSelector(); document.querySelector<HTMLButtonElement>('[aria-label="Choose toolbar mode"]')?.focus(); }
  else return;
  e.preventDefault();
}} onpointermove={onmove} {ontouchstart} onpointerdowncapture={() => (wasHidden = !barShown)}
  onfocusin={(e) => chromeFocus(e.target)} onfocusout={(e) => chromeFocus(e.relatedTarget)}
  ondragover={(e) => e.preventDefault()} ondrop={(e) => { e.preventDefault(); const f = e.dataTransfer?.files[0]; if (f) importBackground(f); }} />

<!-- the visualizer as background sits behind everything; the fullscreen one replaces it while open -->
{#if bg.material === 'viz' && !player.visOpen}<Visualizer background />{/if}

<!-- the material sits on the cards' layer so it scrolls and drifts with them, or on the fixed viewport behind them -->
<div class="scroll" class:fill={!bg.tile} class:m-vinyl={!bg.scroll && bg.material === 'vinyl'} class:m-grille={!bg.scroll && bg.material === 'grille'}
  class:m-fabric={!bg.scroll && bg.material === 'fabric'} class:m-custom={!bg.scroll && (bg.material === 'custom' || bg.material === 'noise')} style:--custom={bg.material === 'noise' ? `url("${noiseBackground}")` : bg.custom ? `url("${bg.custom}")` : 'none'} {onscroll} onwheel={(e) => { if (e.deltaY < 0 && scrollTop <= 4) revealAtTop(); }} bind:this={scroller} bind:clientWidth={viewportWidth} bind:clientHeight={viewportHeight}>
  <div class="grid" class:m-vinyl={bg.scroll && bg.material === 'vinyl'} class:m-grille={bg.scroll && bg.material === 'grille'}
    class:m-fabric={bg.scroll && bg.material === 'fabric'} class:m-custom={bg.scroll && (bg.material === 'custom' || bg.material === 'noise')} style:--cols={effectiveCols} style:--gap="max(0.2px, calc({gap} * var(--u)))"
    style:padding-top="{pixelGap + firstRow * rowStep}px" style:padding-bottom="{140 + (totalRows - lastRow) * rowStep}px"
    style:transform="translate3d({drift.current.x * -8}px, {drift.current.y * -6}px, 0)">
    {#each visibleTiles as t (t.id)}
      <div class="tile-wrap" class:source-highlight={library.highlight} class:spotify-tile={t.source === 'spotify'} class:discovered={t.id === discoveryId}>
        <button class="tile" class:unavailable-art={t.source === 'spotify' && (spotifyDimmed() || !t.available)} class:active={t.id === activeId} onclick={() => { if (t.source === 'spotify' && (!spotifyPlayable() || !t.available)) details = t; else pick(t); }} aria-label="{t.source === 'spotify' && (!spotifyPlayable() || !t.available) ? 'Show saved tracks' : 'Play'} {t.title} — {t.sub} — {t.source}">
          {#if t.cover}<img src={t.cover} alt={t.title} loading="lazy" draggable="false" />{:else}<span class="fallback">{t.title}</span>{/if}
          {#if t.source === 'local'}<i></i>{/if}
        </button>
        {#if t.source === 'spotify' && (!spotifyPlayable() || !t.available)}<span class="availability-badge" title={!t.available ? 'Spotify tracks are not accessible in Music' : spotifyMessage()}>{!t.available ? 'Tracks unavailable' : ''}{#if t.available}{spotify.availability === 'device-unavailable' ? 'Choose output' : spotify.availability === 'checking' ? 'Checking' : spotify.availability === 'restricted' ? 'Access restricted' : spotify.availability === 'offline' ? 'Offline' : spotify.availability === 'reconnect' ? 'Reconnect' : 'Disconnected'}{/if}</span>{/if}
        <div class="tile-info">
          <span class="tile-title">{t.title}<small>{t.sub}</small><small>{t.indexing ? 'Indexing…' : `${t.count} included track${t.count === 1 ? '' : 's'}`}</small></span>
          <span class="tile-actions">
            {#if t.source === 'spotify' && t.externalUrl}
              <button class="source-link" onclick={() => window.spotify!.external(t.externalUrl!).catch((e) => (player.error = e.message))} aria-label="Open {t.title} in Spotify">Spotify ↗</button>
            {:else if library.highlight}<span class="source-link">Local</span>{/if}
            <button class="details" onclick={() => { details = t; player.queueOpen = false; player.view = ''; }} aria-label="Show tracks in {t.title}" title="Included tracks">☷</button>
            <button class="add" onclick={() => addCollection(t)} disabled={!t.available} aria-label="Add {t.title} to queue{t.source === 'spotify' && !spotifyPlayable() ? ' · Spotify required' : ''}" title={t.indexing ? 'Album discovery in progress' : t.available ? (t.source === 'spotify' && !spotifyPlayable() ? 'Add to queue · Spotify required' : 'Add to queue') : 'Spotify does not expose these tracks'}>+</button>
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


{#if library.scan.scanning}<div class="scan">indexing… {library.scan.count} songs</div>{/if}
{#if spotify.syncing || spotify.indexing || library.loading}<div class="library-status" role="status">{spotify.syncing || spotify.indexing ? spotify.progress : 'Loading music…'}</div>{/if}
{#if spotify.indexError}<div class="library-status" role="alert">Album discovery paused: {spotify.indexError} Refresh Spotify in Settings to retry.</div>{/if}
{#if library.mode === 'playlists' && spotify.inaccessiblePlaylists > 0}<p class="playlist-note">Spotify does not expose some playlists’ tracks. Their covers remain visible, but those tracks cannot contribute albums.</p>{/if}
{#if details}<CollectionDetails tile={details} onclose={() => (details = null)} />{/if}
{#if library.error}<div class="library-status" role="alert">{library.error}</div>{/if}

{#if player.view === 'settings'}<Settings bind:art bind:motion onclose={() => (player.view = '')} />{/if}

<style>
  .spotify-availability { display: flex; align-items: center; gap: 8px; height: 48px; font-size: 12px; }
  .spotify-availability > span { flex: 1; min-width: 0; max-height: 34px; overflow: hidden; }
  .spotify-availability > button { flex: 0 0 150px; }
  .tile.unavailable-art img, .tile.unavailable-art .fallback { opacity: .55; }
  .tile img, .tile .fallback { transition: opacity 150ms ease; }
  .availability-badge { position: absolute; top: 8px; left: 8px; z-index: 2; background: #111e; color: white; border-radius: 4px; padding: 4px 7px; font: 12px/1.4 system-ui; pointer-events: none; }
  @media (prefers-reduced-motion: reduce) { .tile img, .tile .fallback { transition: none; } }

  .browse { position: fixed; inset: 0 0 auto; z-index: 6; box-sizing: border-box; color: var(--ui-text); background: var(--ui-surface); border-bottom: 1px solid var(--ui-border); font: 13px/1.4 var(--ui-font); }
  .browse-row { display: flex; align-items: center; gap: 8px; }
  .browse label { display: flex; gap: 4px; min-width: 0; }
  .browse input, .browse button { font: inherit; color: var(--ui-text); background: var(--ui-muted); border: 1px solid var(--ui-border); border-radius: var(--ui-radius); padding: 8px 10px; min-height: 36px; box-sizing: border-box; }
  .browse-search { flex: 1; min-width: 160px; }
  .browse input { width: 100%; }
  .browse button { cursor: pointer; white-space: nowrap; }
  .browse button:hover { background: var(--ui-muted); }
  .browse :is(input, button):focus-visible { outline: 2px solid var(--ui-accent); outline-offset: 2px; }
  .view-tabs { display: flex; flex-shrink: 0; gap: 4px; }
  .view-tabs button[aria-selected=true] { background: var(--ui-accent); color: #111; }
  .filter-caption { position: absolute; width: 1px; height: 1px; padding: 0; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
  .filter-actions { display: flex; align-items: center; gap: 2px; }
  .filter-actions :global([data-slot=button]) { width: 40px; height: 40px; padding: 8px; }
  .discovery-action { display: inline-flex; align-items: center; gap: 7px; }
  .browse .discovery-action { background: transparent; border-color: transparent; }
  .filter-tray { display: flex; align-items: center; flex-wrap: wrap; gap: 10px; }
  .library-info { position: relative; }
  .browse .info-trigger { border: 0; background: transparent; width: 40px; height: 40px; padding: 8px; display: grid; place-items: center; }
  .library-details { position: absolute; right: 0; top: calc(100% + 6px); width: min(340px, 80vw); background: var(--ui-surface); border: 1px solid var(--ui-border); border-radius: 10px; box-shadow: 0 10px 30px #0008; padding: 12px; opacity: 0; visibility: hidden; pointer-events: none; }
  .library-info:hover .library-details, .library-info:focus-within .library-details { opacity: 1; visibility: visible; pointer-events: auto; }
  .library-details::before { content: ''; position: absolute; height: 8px; top: -8px; left: 0; right: 0; }
  .library-details p { margin: 4px 0; color: var(--ui-text-muted); font-size: 12px; }
  .spotify-availability { flex-basis: 100%; max-width: 780px; height: auto; min-height: 36px; }
  .discovered { outline: 2px solid var(--ui-accent); outline-offset: -2px; }
  .discovered .tile-info { opacity: 1; }
  .discovered .tile-actions { pointer-events: auto; }
  .playlist-note { position: fixed; bottom: 110px; left: 16px; max-width: 650px; padding: 8px 12px; background: #111e; color: #bbb; font: 12px/1.5 system-ui; pointer-events: none; }
  @media (max-width: 700px) {
    .browse input, .browse button { min-height: 44px; }
    .filter-tray { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .filter-actions { justify-content: flex-end; }
    .filter-actions :global([data-slot=button]), .browse .info-trigger { width: 44px; height: 44px; }
    .browse .library-details { width: min(320px, calc(100vw - 40px)); }
  }

  .empty-library { position: fixed; inset: 35% 10% auto; text-align: center; color: #bbb; font-size: 18px; }
  .empty-library button { color: white; background: #222; border: 1px solid #777; border-radius: 4px; padding: 12px 18px; cursor: pointer; }
  .tile-wrap { isolation: isolate; position: relative; aspect-ratio: 1; min-width: 0; }
  .tile-wrap .tile { display: block; width: 100%; height: 100%; }
  .tile-info { z-index: 2; opacity: 0; transition: opacity 120ms; position: absolute; bottom: 0; left: 0; right: 0; display: flex; flex-direction: column; align-items: stretch; gap: 5px; padding: 8px; background: linear-gradient(transparent, #000d); color: white; pointer-events: none; font-size: clamp(11px, 1vw, 16px); }
  .tile-title { min-width: 0; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; text-shadow: 0 1px 3px #000; }
  .tile-title small { display: block; opacity: .75; overflow: hidden; text-overflow: ellipsis; }
  .tile-actions { flex-wrap: wrap; display: flex; justify-content: flex-end; align-items: center; gap: 6px; pointer-events: none; }
  .tile-wrap:hover .tile-info, .tile-wrap:focus-within .tile-info { opacity: 1; }
  .tile-wrap:hover .tile-actions, .tile-wrap:focus-within .tile-actions { pointer-events: auto; }
  @media (hover: none) { .tile-wrap:focus-within .tile-info { opacity: 1; } }
  @media (prefers-reduced-motion: reduce) { .tile-info { transition: none; } }
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
  .controls { display: flex; align-items: center; justify-content: center; flex-wrap: wrap; gap: 12px 24px; color: var(--ui-text); font: inherit; }
  .browse { transition: transform 260ms cubic-bezier(.16,1,.3,1), opacity 180ms ease-out; transform: translateY(0); }
  .browse.hidden { opacity: 0; transform: translateY(-100%); pointer-events: none; transition-duration: 180ms; }
  @media (prefers-reduced-motion: reduce) { .browse, .browse.hidden { transform: none; transition: opacity 100ms; } }
  .controls :is(button, input):focus-visible { outline: 2px solid var(--ui-accent); outline-offset: 4px; }
  /* scan progress while navidrome indexes the folder (first run, new files) */
  .scan { position: fixed; left: 50%; bottom: 130px; transform: translateX(-50%); padding: 8px 16px; border-radius: 4px;
    background: rgba(0, 0, 0, 0.7); color: var(--ui-text); font-size: 14px; letter-spacing: .12em; text-transform: uppercase; pointer-events: none; z-index: 2; }
  .controls label { display: flex; align-items: center; gap: 12px; }
  .slider-control :global([data-slot=slider]) { flex: 1; min-width: 60px; width: auto; }
  .grid-size { width: min(100%, 400px); }
  .grid-size-track { flex: 1; min-width: 60px; }
  .grid-size > span:last-child { white-space: nowrap; font-variant-numeric: tabular-nums; }
  .slider-control { flex: 1 1 220px; max-width: 340px; }
  .slider-control > span { width: 56px; color: var(--ui-text); }
  .slider-control output { min-width: 3ch; text-align: right; font-variant-numeric: tabular-nums; }
  .group { display: flex; align-items: center; justify-content: center; flex-wrap: wrap; gap: 6px; }
  .controls .opt { font: inherit; cursor: pointer; padding: 9px 12px; min-height: 40px; color: var(--ui-text); background: transparent; border: 0; border-radius: 6px; transition: color 140ms, background 140ms; }
  .controls .opt:hover { background: var(--ui-muted); color: var(--ui-text); }
  .controls .opt:disabled { color: #787880; cursor: default; background: transparent; }
  .controls .opt.on { background: var(--ui-accent); color: #111; }
  .controls input[type=checkbox] { width: 18px; height: 18px; accent-color: var(--ui-accent); cursor: pointer; }

  @media (max-width: 700px) {
    .controls { gap: 8px; }
    .controls .group { width: 100%; flex-wrap: nowrap; overflow-x: auto; justify-content: flex-start; padding: 2px; box-sizing: border-box; scrollbar-width: thin; scrollbar-color: var(--ui-border) transparent; }
    .controls .group button { flex-shrink: 0; }
    .slider-control { flex-basis: 100%; max-width: none; }
    .controls .opt { min-height: 44px; }
  }
  @media (prefers-reduced-motion: reduce) { .controls, .controls .opt { transition: none; } }
  .browse { padding: 16px 76px; min-height: 72px; display: flex; align-items: center; box-sizing: border-box; }
  .back-library { position: absolute; left: 20px; width: 40px; height: 40px; padding: 8px; top: 50%; transform: translateY(-50%); display: flex; align-items: center; justify-content: center; gap: 6px; }
  .back-library span { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); }
  .bar-modes { position: absolute; top: 50%; transform: translateY(-50%); right: 20px; z-index: 4; }
  .bar-modes :global([data-slot=button]) { width: 40px; height: 40px; padding: 8px; }
  .mode-options { position: absolute; top: 50%; right: calc(100% + 8px); width: max-content; max-width: calc(100vw - 104px); padding: 2px; display: flex; align-items: center; gap: 2px; overflow-x: auto; background: var(--ui-surface); border-radius: var(--ui-radius); opacity: 0; transform: translate(8px, -50%); pointer-events: none; transition: opacity 140ms ease-out, transform 180ms cubic-bezier(.16,1,.3,1); scrollbar-width: thin; scrollbar-color: var(--ui-border) transparent; }
  .expanded .mode-options { opacity: 1; transform: translateY(-50%); pointer-events: auto; }
  .mode-options button { text-align: left; background: transparent; border-color: transparent; padding: 8px 12px; }
  .mode-options button[aria-pressed=true] { background: var(--ui-muted); }
  .mode-options :global([data-slot=button]) { width: auto; justify-content: center; }
  .bar-content[hidden] { display: none; }
  .bar-content { width: 100%; max-width: 860px; margin-inline: auto; min-width: 0; }
  .browse-row, .filter-tray { padding: 0; justify-content: center; }
  .browse-row[hidden] { display: none; }
  .browse-search { max-width: 400px; }
  @media (max-width: 700px) {
    .browse { padding: 16px 64px; min-height: 76px; }
      .back-library { top: 50%; transform: translateY(-50%); left: 12px; width: 44px; height: 44px; padding: 10px; }
    .bar-modes { right: 12px; }
    .bar-modes :global([data-slot=button]) { width: 44px; height: 44px; padding: 10px; }
    .mode-options { max-width: calc(100vw - 88px); }
    .mode-options :global([data-slot=button]) { width: auto; }
    .browse-row { flex-wrap: nowrap; gap: 8px; overflow-x: auto; justify-content: flex-start; }
    .browse-search { min-width: 160px; }
    .browse-row > * { flex-shrink: 0; }
    .browse .filter-tray { display: flex; flex-wrap: nowrap; overflow-x: auto; justify-content: flex-start; }
    .filter-tray > * { flex-shrink: 0; }
    .controls { flex-wrap: nowrap; overflow-x: auto; justify-content: flex-start; }
    .controls > * { flex-shrink: 0; }
    .controls .slider-control { flex-basis: 220px; }
    .controls .grid-size { width: 270px; }
    .discovery-action span { display: none; }
  }
  @media (prefers-reduced-motion: reduce) { .mode-options { transform: translateY(-50%); transition: opacity 100ms; } }
</style>
