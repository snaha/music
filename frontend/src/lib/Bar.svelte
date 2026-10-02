<script lang="ts">
  import { tick } from 'svelte';
  import { session } from './api.svelte';
  import { jumpRandom, next, prev, player, seek, setOrder, toggle, type Order } from './player.svelte';
  import { spotify } from './spotify.svelte';
  import { grid } from './library.svelte';
  import Queue from './Queue.svelte';
  import { artworkPalette, fallbackPalette } from './artwork-palette';
  let palette = $state(fallbackPalette);
  const playingCover = $derived(player.song?.cover ?? '');
  $effect(() => {
    const cover = playingCover;
    let active = true;
    if (!cover) palette = fallbackPalette;
    artworkPalette(cover).then(value => { if (active) palette = value; });
    return () => { active = false; };
  });
  import Share from './Share.svelte';
  let { hidden }: { hidden: boolean } = $props();
  // publish the bar height so the song list can pad for it
  let barHeight = $state(0);
  $effect(() => { document.documentElement.style.setProperty('--botbar', `${barHeight}px`); });
  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  // random picks songs from the albums the grid shows
  // icons after VLC's: an arrow into a stop bar for in order, crossing arrows for shuffle; a die for random, which VLC lacks
  const ORDERS: Record<Order, string> = { normal: 'In order', shuffle: 'Shuffle queue', random: 'Random from the grid' };
  // the bottom-right menu: share, visualizer and play order. It stays open until closed like the song list
  let menu = $state(false), key = $state<HTMLElement>(), panel = $state<HTMLElement>();
  function focusMenu(last = false) {
    const items = panel?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)');
    (last ? items?.[items.length - 1] : items?.[0])?.focus();
  }
  async function openMenu(last = false) { menu = true; await tick(); focusMenu(last); }
  function menuKeys(e: KeyboardEvent) {
    const items = [...panel!.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
    const index = items.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); menu = false; key?.focus(); }
    else if (['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) {
      e.preventDefault(); e.stopPropagation();
      const next = e.key === 'Home' ? 0 : e.key === 'End' ? items.length - 1 : (index + (['ArrowDown', 'ArrowRight'].includes(e.key) ? 1 : -1) + items.length) % items.length;
      items[next]?.focus();
    } else if (e.key === 'Tab') { e.preventDefault(); e.stopPropagation(); menu = false; document.querySelector<HTMLElement>(e.shiftKey ? '.bar .btns button:last-child' : '.bar .progress')?.focus(); }
  }
  // hot corners: the pointer pushed into a bottom screen corner opens what that corner holds, which then stays until closed:
  // the song list on the left (only with a song loaded, like the button it stands in for), the menu on the right.
  // mouse only, and only while the bar shows
  const touch = matchMedia('(hover: none), (pointer: coarse)').matches;
  function atCorner(e: MouseEvent, slack: number) {
    if (touch || hidden || e.clientY < innerHeight - slack) return '';
    return e.clientX <= slack ? (player.song ? 'left' : '') : e.clientX >= innerWidth - slack ? 'right' : '';
  }
  function openCorner(c: string) { if (c === 'left') player.queueOpen = true; if (c === 'right') menu = true; }
  // only entering the corner opens it: a pointer resting there must not reopen it the moment it is closed
  // (Chrome sends a synthetic move when the layout under the pointer changes)
  let inCorner = '';
  function onmove(e: PointerEvent) { const now = atCorner(e, 2); if (now !== inCorner) openCorner(now); inCorner = now; }
  function onclick(e: MouseEvent) {
    const t = e.target as Node;
    if (menu && !key?.contains(t) && !panel?.contains(t)) menu = false;
    const target = e.target as Element;
    if (target.closest('.bar') && !target.closest('.key')) revealPlayer();
  }
  // a menu item that opens a view hands the screen to it
  function revealPlayer() { player.queueOpen = true; }
  function share() { player.viewFrom = 'bottom'; player.view = player.view === 'share' ? '' : 'share'; menu = false; }
  function visualize() { player.visOpen = true; menu = false; }
</script>

<!-- the pointer leaves a frameless window through a corner, so the leave event counts too, with more slack -->
<svelte:window onpointermove={onmove} {onclick} />
<svelte:document onmouseleave={(e) => openCorner(atCorner(e, 24))} />

{#if session.api}
  <div class="playback-world" style={palette}>
  {#if player.queueOpen}<Queue {palette} onclose={() => (player.queueOpen = false)} />{/if}
  {#if player.view === 'share'}<Share from={player.viewFrom} onclose={() => (player.view = '')} />{/if}
  <div class="menu-panel" class:open={menu} role="menu" aria-label="Playback options" aria-hidden={!menu} inert={!menu} bind:this={panel} onkeydown={menuKeys}>
    {#if session.admin}<button role="menuitem" tabindex={menu ? 0 : -1} class:on={player.view === 'share'} onclick={share}>Share</button>{/if}
    <button role="menuitem" tabindex={menu ? 0 : -1} onclick={() => { player.queueTab = 'history'; player.queueOpen = true; menu = false; }}>Recently played</button>
    <button role="menuitem" tabindex={menu ? 0 : -1} onclick={visualize}>Visualizer</button>
    {#if !player.song}<button role="menuitem" tabindex={menu ? 0 : -1} onclick={() => { player.queueOpen = !player.queueOpen; menu = false; }}>Queue ({player.queue.length})</button>{/if}
    <button role="menuitem" tabindex={menu ? 0 : -1} onclick={() => { player.shortcutsOpen = true; menu = false; }}>Keyboard shortcuts <span aria-hidden="true">?</span></button>
    <span class="rule"></span>
    <!-- stays open after a jump, so it can be pressed again right away -->
    <button role="menuitem" tabindex={menu ? 0 : -1} onclick={() => jumpRandom(grid)}>Play a random song</button>
    <span class="orders" role="group" aria-label="Play order">
      {#each Object.entries(ORDERS) as [o, label] (o)}
        <button role="menuitemradio" tabindex={menu ? 0 : -1} aria-checked={player.order === o} aria-label={label} title={label} class:on={player.order === o} onclick={() => setOrder(o as Order, grid)}>
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            {#if o === 'normal'}<path d="M3 12h13M12 8l4 4-4 4M20 6v12" />
            {:else if o === 'shuffle'}<path d="M3 7h2.5c5.5 0 7.5 10 13 10H21M3 17h2.5c2.3 0 3.9-1.8 5.2-4M13.3 11c1.3-2.2 2.9-4 5.2-4H21M18 4l3 3-3 3M18 14l3 3-3 3" />
            {:else}<rect x="4" y="4" width="16" height="16" rx="3" />
              {#each [[8.5, 8.5], [15.5, 8.5], [12, 12], [8.5, 15.5], [15.5, 15.5]] as [cx, cy] (`${cx}${cy}`)}<circle {cx} {cy} r="1.1" fill="currentColor" stroke="none" />{/each}
            {/if}
          </svg>
          <span>{label}</span>
          <svg class="order-check" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="m5 12 4 4L19 6" /></svg>
        </button>
      {/each}
    </span>
  </div>
  {#if player.error || player.pending || player.requesting}
    <div class="playback-status" role="status">{player.error || (player.requesting ? 'Loading tracks…' : 'Connecting playback…')}
      {#if player.error}<button onclick={() => { player.viewFrom = 'right'; player.view = 'settings'; }}>Settings</button><button onclick={() => (player.error = '')} aria-label="Dismiss playback message">×</button>{/if}
    </div>
  {/if}
  <div class="bar" class:hidden={hidden && !player.queueOpen && !player.view && !menu && !player.pending && !player.error} class:lit={player.queueOpen || !!player.view || menu} bind:clientHeight={barHeight} role="group" aria-label="Playback bar">
    {#if player.song}
      <!-- cover + title + artist: one control that opens the song list -->
      <button class="left" onclick={revealPlayer} aria-label="Show songs" aria-keyshortcuts="q" aria-expanded={player.queueOpen}>
        <img src={player.song.cover} alt="" />
        <span class="meta"><b>{player.song.title}</b> <span>{player.song.artist}{#if player.song.album} · {player.song.album}{/if}</span></span>
      </button>
    {:else}
      <span class="left"></span>
    {/if}
    {#if player.song?.source === 'spotify'}<button class="provider" onclick={() => window.spotify!.external(player.song!.externalUrl!).catch((e) => (player.error = e.message))}>Spotify ↗<small>{spotify.deviceName}</small></button>{/if}
    <span class="ctl">
      <span class="btns">
        <button onclick={prev} disabled={!player.song} aria-label="Previous track" aria-keyshortcuts="ArrowLeft"><svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M5 5h2v14H5zM19 5v14L8 12z" /></svg></button>
        <button onclick={toggle} disabled={!player.queue.length} aria-label={player.playing || player.pending ? 'Pause' : 'Play'}><svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true">{#if player.pending}<circle cx="12" cy="12" r="7" fill="none" stroke="currentColor" stroke-width="2" stroke-dasharray="24 20" />{:else if player.playing}<path d="M7 5h4v14H7zM14 5h4v14h-4z" />{:else}<path d="m8 4 13 8-13 8z" />{/if}</svg></button>
        <button onclick={next} disabled={!player.song} aria-label="Next track" aria-keyshortcuts="ArrowRight"><svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M17 5h2v14h-2zM5 5l11 7-11 7z" /></svg></button>
      </span>
      <span class="time">{fmt(player.time)} / {fmt(player.duration)}</span>
    </span>
    <!-- reaches the screen edge so a click in the corner itself opens the menu, like the song list on the left -->
    <button class="key" class:down={menu} bind:this={key} onclick={() => { if (menu) menu = false; else void openMenu(); }} onkeydown={e => { if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); void openMenu(e.key === 'ArrowUp'); } else if (e.key === 'Escape' && menu) { e.preventDefault(); e.stopPropagation(); menu = false; } }} aria-haspopup="menu" aria-expanded={menu} aria-label="Menu">
      <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 7h16M4 12h16M4 17h16" /></svg>
    </button>
    <div class="progress" role="slider" tabindex="0" aria-label="Seek" aria-valuemin={0} aria-valuemax={player.duration || 0} aria-valuenow={Math.min(player.time, player.duration || 0)} aria-valuetext={`${fmt(player.time)} of ${fmt(player.duration)}`}
      onclick={(e) => { const bounds = e.currentTarget.getBoundingClientRect(); seek((e.clientX - bounds.left) / bounds.width); }}
      onkeydown={(e) => { if (!player.duration || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return; e.preventDefault(); e.stopPropagation(); seek(e.key === 'Home' ? 0 : e.key === 'End' ? 1 : (player.time + (e.key === 'ArrowLeft' ? -10 : 10)) / player.duration); }}>
      <i style:width="{player.duration ? (player.time / player.duration) * 100 : 0}%"></i>
    </div>
  </div>
  </div>
{/if}

<style>
  .playback-status { position: fixed; bottom: 110px; left: 50%; transform: translateX(-50%); max-width: min(90vw, 720px); background: #161616f5; color: #eee; padding: 12px 16px; border: 1px solid #555; border-radius: 6px; z-index: 5; font-size: 14px; line-height: 1.5; }
  .playback-status button { background: none; color: white; border: 1px solid #777; border-radius: 3px; padding: 4px 8px; margin-left: 10px; cursor: pointer; }
  .provider small { display: block; font-size: 10px; opacity: .6; }
  .bar button.provider { font-size: 13px; }
  .bar {
    --s: clamp(0.85px, 100vw / 1600, 1.3px);
    position: fixed; left: 0; right: 0; bottom: 0; height: calc(96 * var(--s)); padding: 0 calc(16 * var(--s));
    padding-bottom: env(safe-area-inset-bottom, 0px);
    display: flex; align-items: center; gap: calc(12 * var(--s)); color: #eee; font-size: calc(20 * var(--s));
    background: rgba(0, 0, 0, 0.6); transition: opacity 600ms, background 200ms; z-index: 2; /* same tone as top bar and side panel */
  }
  .bar:hover, .bar.lit { background: rgba(0, 0, 0, 0.78); } /* darker while hovered or an overlay is open, like the panels */
  .bar.hidden:not(:hover) { opacity: 0; pointer-events: none; } /* stays visible while the mouse rests on it */
  /* .bar .left outranks the generic .bar button reset below, so it keeps filling the middle;
     it reaches the screen edge so a click in the corner itself opens the list */
  .bar .left {
    all: unset; flex: 1; min-width: 0; display: flex; align-items: center; gap: calc(12 * var(--s));
    align-self: stretch; padding: 0 calc(8 * var(--s)) 0 calc(16 * var(--s)); margin-left: calc(-16 * var(--s)); border-radius: 0 3px 3px 0;
    font-size: calc(20 * var(--s)); transition: background 150ms, opacity 100ms;
  }
  .bar button.left { cursor: pointer; }
  .bar button.left:hover { background: rgba(255, 255, 255, 0.06); }
  .bar button.left:active { background: rgba(255, 255, 255, 0.03); opacity: .8; }
  .bar img { width: calc(56 * var(--s)); height: calc(56 * var(--s)); object-fit: cover; opacity: .95; flex-shrink: 0; }
  .meta { min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .meta b { font-weight: 600; color: var(--play-text); }
  .meta span { opacity: .7; margin-left: 8px; }
  .bar button { all: unset; cursor: pointer; font-size: calc(20 * var(--s)); padding: 4px 12px; opacity: .9; }
  .bar button:disabled { opacity: .3; cursor: default; }
  .bar .key {
    display: flex; align-items: center; align-self: stretch; padding: 0 calc(16 * var(--s)) 0 calc(12 * var(--s)); margin-right: calc(-16 * var(--s));
    border-radius: 3px 0 0 3px; opacity: .7; transition: background 150ms, opacity 100ms;
  }
  .bar .key:hover, .bar .key.down { opacity: 1; background: rgba(255, 255, 255, 0.06); }
  /* the menu: same width, tone and type as the top-right panel, as tall as its items, sitting on the bar's right end */
  .menu-panel {
    --s: clamp(0.5px, 100vw / 1600, 1px);
    position: fixed; right: 0; bottom: var(--botbar, 0px); width: min(80vw, calc(340 * var(--s))); box-sizing: border-box;
    display: flex; flex-direction: column; gap: calc(4 * var(--s)); padding: calc(16 * var(--s)) calc(20 * var(--s));
    background: rgba(0, 0, 0, 0.78); color: #fff; font-size: calc(24 * var(--s)); letter-spacing: .08em; text-transform: uppercase; user-select: none;
    transform: translateX(18px); opacity: 0; visibility: hidden; pointer-events: none; transition: transform 140ms cubic-bezier(.16,1,.3,1), opacity 140ms, visibility 0s 140ms; z-index: 2;
  }
  .menu-panel.open { transform: translateX(0); opacity: 1; visibility: visible; pointer-events: auto; transition-duration: 240ms, 180ms, 0s; transition-delay: 0s; }
  .menu-panel button { all: unset; cursor: pointer; padding: calc(12 * var(--s)) calc(16 * var(--s)); border-radius: 3px; opacity: .7; }
  .menu-panel button:hover { background: #ffffff14; opacity: 1; }
  .menu-panel button.on { opacity: 1; background: #ffffff1c; }
  .rule { height: 1px; background: #fff2; margin: calc(8 * var(--s)) calc(16 * var(--s)); }
  @media (max-width: 700px) {
    .menu-panel { width: min(80vw, calc(600 * var(--s))); font-size: calc(40 * var(--s)); gap: calc(8 * var(--s)); }
    .menu-panel button { padding: calc(20 * var(--s)) calc(24 * var(--s)); }
  }
  .ctl { display: flex; flex-direction: column; align-items: center; gap: 0; flex-shrink: 0; }
  .btns { display: flex; align-items: center; }
  .time { opacity: .7; font-size: .7em; font-variant-numeric: tabular-nums; }
  /* phones: let title/artist take two lines */
  @media (max-width: 700px) {
    .meta { white-space: normal; display: flex; flex-direction: column; line-height: 1.2; }
    .meta b, .meta span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .meta span { margin-left: 0; }
  }
  /* the seek line is 2px, but the hit area is 18px tall straddling the bar's top edge (touch and mouse slop);
     hovering thickens the line */
  .progress { --h: 2px; position: absolute; left: 0; right: 0; top: -9px; height: 18px; cursor: pointer; z-index: 1; }
  .progress::before { content: ''; position: absolute; left: 0; right: 0; top: 9px; height: var(--h); background: #ffffff0a; }
  .progress i { position: absolute; left: 0; top: 9px; height: var(--h); background: #fff5; transition: background 120ms; }
  .progress:hover { --h: 6px; }
  .progress:hover i { background: #fff9; }
  .playback-world { color: var(--play-text); font-family: var(--ui-font); }
  .bar { height: 76px; box-sizing: content-box; background: var(--play-bar); color: var(--play-text); font: 14px/1.4 var(--ui-font); transition: opacity 600ms, background-color 300ms ease-out, color 300ms ease-out; }
  .bar:hover, .bar.lit { background: var(--play-bar); }
  .bar .left { max-width: calc(50% - 120px); font-size: 14px; gap: 12px; }
  .bar img { width: 52px; height: 52px; border-radius: 3px; opacity: 1; }
  .meta { display: flex; flex-direction: column; gap: 3px; }
  .meta b, .meta span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .meta span { margin: 0; opacity: 1; color: var(--play-muted); font-size: 12px; }
  .ctl { position: absolute; left: 50%; transform: translateX(-50%); gap: 2px; }
  .bar .btns button { display: grid; place-items: center; width: 44px; height: 40px; box-sizing: border-box; padding: 0; border-radius: 6px; }
  .bar .btns button:hover { background: var(--play-line); }
  .bar .btns button:nth-child(2) { color: var(--play-bar); background: var(--play-accent); }
  .time { color: var(--play-muted); opacity: 1; font-size: 11px; }
  .bar .provider { margin-left: auto; max-width: 180px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12px; }
  .bar .key { margin-left: auto; min-width: 44px; justify-content: center; padding: 0 12px; }
  .bar .provider + .ctl + .key { margin-left: 0; }
  .bar button:focus-visible, .progress:focus-visible { outline: 2px solid var(--play-accent); outline-offset: -3px; }
  .bar:focus-within { opacity: 1; pointer-events: auto; }
  .progress::before { background: var(--play-line); }
  .progress i, .progress:hover i { background: var(--play-accent); }
  .menu-panel { width: 250px; padding: 12px; gap: 4px; background: var(--play-bar); color: var(--play-text); font: 14px/1.4 var(--ui-font); letter-spacing: 0; text-transform: none; }
  .menu-panel button { display: flex; align-items: center; gap: 12px; width: 100%; min-height: 44px; box-sizing: border-box; padding: 10px 12px; opacity: 1; text-align: left; border-radius: var(--ui-radius); }
  .menu-panel button:focus-visible { outline: 2px solid var(--play-accent); outline-offset: -2px; }
  .menu-panel button:hover, .menu-panel button.on { background: var(--play-line); }
  .rule { background: var(--play-line); margin: 8px 12px; }
  .menu-panel .orders { display: flex; flex-direction: column; gap: 4px; }
  .menu-panel .orders button { width: 100%; justify-content: flex-start; gap: 12px; border: 0; padding: 10px 12px; }
  .menu-panel .orders button svg { flex-shrink: 0; }
  .menu-panel .orders button span { flex: 1; text-align: left; }
  .menu-panel .orders button.on { background: var(--play-line); color: var(--play-text); }
  .order-check { visibility: hidden; }
  .on .order-check { visibility: visible; }
  .menu-panel button { transition: background-color 140ms ease-out; }
  .menu-panel button:active { background: var(--play-line); }
  .menu-panel button > span[aria-hidden] { color: var(--play-muted); margin-left: auto; }
  .bar .key svg { width: 20px; height: 20px; }
  .bar .key:hover, .bar .key.down { background: var(--play-line); }
  @media (max-width: 700px) {
    .bar { height: 112px; padding: 0 12px; padding-bottom: env(safe-area-inset-bottom, 0px); }
    .bar .left { position: absolute; top: 8px; left: 12px; height: 48px; max-width: calc(100% - 64px); padding: 0; margin: 0; font-size: 13px; }
    .bar img { width: 44px; height: 44px; }
    .bar .meta span { margin: 0; }
    .ctl { bottom: 8px; flex-direction: row; gap: 14px; }
    .bar .btns button { height: 44px; }
    .bar .provider { display: none; }
    .bar .key { position: absolute; right: 8px; top: 8px; height: 44px; margin: 0; padding: 0; }
    .menu-panel { width: min(280px, 90vw); font-size: 14px; gap: 4px; }
    .menu-panel button { padding: 10px 12px; }
  }
  @media (prefers-reduced-motion: reduce) { .menu-panel { transform: none; transition: opacity 80ms, visibility 0s 80ms; } .menu-panel.open { transition-delay: 0s; } .bar { transition: opacity 80ms, background 80ms; } }
</style>
