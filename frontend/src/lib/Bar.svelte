<script lang="ts">
  import { coverUrl, session } from './api.svelte';
  import { jumpRandom, next, player, prev, seek, setOrder, setVolume, toggle, toggleMute, type Order } from './player.svelte';
  import { grid } from './library.svelte';
  import Queue from './Queue.svelte';
  import Share from './Share.svelte';
  let { hidden }: { hidden: boolean } = $props();
  // publish the bar height so the song list and the menu can sit on it
  let barHeight = $state(0);
  $effect(() => { document.documentElement.style.setProperty('--botbar', `${barHeight}px`); });
  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  // random picks songs from the albums the grid shows
  // icons after VLC's: an arrow into a stop bar for in order, crossing arrows for shuffle; a die for random, which VLC lacks
  const ORDERS: Record<Order, string> = { normal: 'In order', shuffle: 'Shuffle album', random: 'Random from the grid' };
  // the bottom-right menu: share, visualizer and play order. It stays open until closed like the song list
  let menu = $state(false), key = $state<HTMLElement>(), panel = $state<HTMLElement>();
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
  function onclick(e: MouseEvent) { const t = e.target as Node; if (menu && !key?.contains(t) && !panel?.contains(t)) menu = false; }
  // a menu item that opens a view hands the screen to it
  function share() { player.viewFrom = 'bottom'; player.view = player.view === 'share' ? '' : 'share'; menu = false; }
  function visualize() { player.visOpen = true; menu = false; }
  // the seek slider: 1000 steps over the song; the volume slider: 100 steps
  let pos = $derived(player.duration ? Math.round((player.time / player.duration) * 1000) : 0);
  let left = $derived(Math.max(0, player.duration - player.time));
</script>

<!-- the pointer leaves a frameless window through a corner, so the leave event counts too, with more slack -->
<svelte:window onpointermove={onmove} {onclick} />
<svelte:document onmouseleave={(e) => openCorner(atCorner(e, 24))} />

{#if session.api}
  {#if player.queueOpen}<Queue onclose={() => (player.queueOpen = false)} />{/if}
  {#if player.view === 'share'}<Share from={player.viewFrom} onclose={() => (player.view = '')} />{/if}
  <div class="menu-panel" class:open={menu} role="menu" aria-hidden={!menu} bind:this={panel}>
    {#if session.admin}<button role="menuitem" tabindex={menu ? 0 : -1} class:on={player.view === 'share'} onclick={share}>Share</button>{/if}
    <button role="menuitem" tabindex={menu ? 0 : -1} onclick={visualize}>Visualizer</button>
    <span class="rule"></span>
    <!-- stays open after a jump, so it can be pressed again right away -->
    <button role="menuitem" tabindex={menu ? 0 : -1} onclick={() => jumpRandom(grid)}>Shuffle</button>
    <span class="orders" role="radiogroup" aria-label="Play order">
      {#each Object.entries(ORDERS) as [o, label] (o)}
        <button role="radio" tabindex={menu ? 0 : -1} aria-checked={player.order === o} aria-label={label} title={label} class:on={player.order === o} onclick={() => setOrder(o as Order, grid)}>
          <svg viewBox="0 0 24 24" width="1.2em" height="1.2em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            {#if o === 'normal'}<path d="M3 12h13M12 8l4 4-4 4M20 6v12" />
            {:else if o === 'shuffle'}<path d="M3 7h2.5c5.5 0 7.5 10 13 10H21M3 17h2.5c2.3 0 3.9-1.8 5.2-4M13.3 11c1.3-2.2 2.9-4 5.2-4H21M18 4l3 3-3 3M18 14l3 3-3 3" />
            {:else}<rect x="4" y="4" width="16" height="16" rx="3" />
              {#each [[8.5, 8.5], [15.5, 8.5], [12, 12], [8.5, 15.5], [15.5, 15.5]] as [cx, cy] (`${cx}${cy}`)}<circle {cx} {cy} r="1.1" fill="currentColor" stroke="none" />{/each}
            {/if}
          </svg>
        </button>
      {/each}
    </span>
  </div>
  <!-- Figma Frame 43 / 45: the dock is the bar plus the time above it. At rest the time is a 4px strip on the bar's top edge;
       while the dock is hovered (or the seek slider focused) it opens into a row with elapsed, a slider and the time left -->
  <div class="dock" class:hidden={hidden && !player.queueOpen && !player.view && !menu} class:lit={player.queueOpen || !!player.view || menu}>
    <div class="time">
      <span class="t">{fmt(player.time)}</span>
      <input class="slider seek" type="range" min="0" max="1000" value={pos} disabled={!player.duration} aria-label="Seek" aria-valuetext="{fmt(player.time)} of {fmt(player.duration)}"
        style:--p="{pos / 10}%" oninput={(e) => seek(Number(e.currentTarget.value) / 1000)} />
      <span class="t">-{fmt(left)}</span>
    </div>
    <div class="bar" bind:clientHeight={barHeight}>
      <!-- left third: cover, title and "album — artist"; one control that opens the song list -->
      {#if player.song}
        <button class="now" onclick={() => (player.queueOpen = !player.queueOpen)} aria-label="Show songs" aria-expanded={player.queueOpen}>
          <img src={coverUrl(player.song.coverArt, 96)} alt="" />
          <span class="meta"><b>{player.song.title}</b><span>{player.song.album} — {player.song.artist}</span></span>
        </button>
      {:else}
        <span class="now"></span>
      {/if}
      <!-- middle third: the transport -->
      <span class="transport">
        <button class="ghost lg" onclick={prev} disabled={!player.song} aria-label="Previous"><i class="prev"></i></button>
        <button class="primary lg" onclick={toggle} disabled={!player.song} aria-label={player.playing ? 'Pause' : 'Play'}><i class={player.playing ? 'pause' : 'play'}></i></button>
        <button class="ghost lg" onclick={next} disabled={!player.song} aria-label="Next"><i class="next"></i></button>
      </span>
      <!-- right third: mute, volume, full, and the key that opens the menu -->
      <span class="side">
        <button class="ghost" class:on={player.muted} onclick={toggleMute} aria-label={player.muted ? 'Unmute' : 'Mute'} aria-pressed={player.muted}><i class="mute"></i></button>
        <input class="slider volume" type="range" min="0" max="100" value={player.muted ? 0 : Math.round(player.volume * 100)} aria-label="Volume"
          style:--p="{player.muted ? 0 : player.volume * 100}%" oninput={(e) => setVolume(Number(e.currentTarget.value) / 100)} />
        <button class="ghost" onclick={() => setVolume(1)} aria-label="Full volume"><i class="loud"></i></button>
        <button class="ghost" class:down={menu} bind:this={key} onclick={() => (menu = !menu)} aria-haspopup="menu" aria-expanded={menu} aria-label="Menu"><i class="menu"></i></button>
      </span>
    </div>
  </div>
{/if}

<style>
  /* design tokens from the Figma file (shadcn base): background, foreground, primary, muted, ring */
  .dock {
    --bg: #0a0a0a; --fg: #fafafa; --primary: #e5e5e5; --muted: #262626; --ring: #737373;
    position: fixed; left: 0; right: 0; bottom: 0; display: flex; flex-direction: column; z-index: 2;
    color: var(--fg); font: 400 14px/20px system-ui, sans-serif; letter-spacing: 0; text-transform: none; user-select: none;
    transition: opacity 600ms;
  }
  .dock.hidden:not(:hover) { opacity: 0; pointer-events: none; } /* stays visible while the mouse rests on it */
  .bar { display: flex; align-items: center; gap: 8px; padding: 8px; padding-bottom: calc(8px + env(safe-area-inset-bottom, 0px)); background: var(--bg); box-sizing: border-box; }
  .bar > * { flex: 1 0 0; min-width: 0; }
  /* left third */
  .now { all: unset; flex: 1 0 0; display: flex; align-items: center; gap: 8px; min-width: 0; border-radius: 2px; } /* all: unset would drop the third */
  button.now { cursor: pointer; }
  button.now:hover .meta { opacity: .85; }
  .now img { width: 40px; height: 40px; border-radius: 2px; object-fit: cover; flex-shrink: 0; }
  .meta { display: flex; flex-direction: column; min-width: 0; overflow-wrap: anywhere; }
  .meta b { font-weight: 700; }
  .meta b, .meta span { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  /* middle third */
  .transport { display: flex; align-items: center; justify-content: center; gap: 8px; }
  /* right third */
  .side { display: flex; align-items: center; justify-content: flex-end; gap: 8px; }
  /* shadcn icon buttons: ghost (transparent, muted on hover) and primary; the 16px icons are the design's SVGs as masks */
  .bar button.ghost, .bar button.primary { all: unset; cursor: pointer; display: flex; align-items: center; justify-content: center; width: 32px; height: 32px; border-radius: 10px; box-sizing: border-box; flex: none; }
  .bar button.lg { width: 36px; height: 36px; }
  .bar button.ghost:hover, .bar button.ghost.down, .bar button.ghost.on { background: var(--muted); }
  .bar button.primary { background: var(--primary); }
  .bar button.primary:hover { background: #fff; }
  .bar button:disabled { opacity: .5; cursor: default; }
  .bar button i { width: 16px; height: 16px; background: var(--fg); mask: var(--icon) center / 16px 16px no-repeat; }
  i.prev { --icon: url('./icons/skip-back.svg'); } i.play { --icon: url('./icons/play.svg'); } i.pause { --icon: url('./icons/pause.svg'); }
  i.next { --icon: url('./icons/skip-forward.svg'); } i.mute { --icon: url('./icons/volume-x.svg'); } i.loud { --icon: url('./icons/volume-2.svg'); } i.menu { --icon: url('./icons/image-play.svg'); }
  .bar button.primary i { background: var(--bg); }
  .bar button:focus-visible { outline: 2px solid var(--ring); outline-offset: 2px; }
  /* sliders: a 4px rounded track in muted, the range in primary, a 12px white thumb with a ring border */
  .slider { -webkit-appearance: none; appearance: none; margin: 0; padding: 4px 0; height: 12px; background: none; cursor: pointer; }
  .slider::-webkit-slider-runnable-track { height: 4px; border-radius: 9999px; background: linear-gradient(to right, var(--primary) var(--p, 0%), var(--muted) var(--p, 0%)); }
  .slider::-webkit-slider-thumb { -webkit-appearance: none; width: 12px; height: 12px; margin-top: -4px; border-radius: 50%; background: #fff; border: 1px solid var(--ring); box-sizing: border-box; }
  .slider:disabled { cursor: default; }
  .slider:focus-visible { outline: 2px solid var(--ring); outline-offset: 2px; border-radius: 9999px; }
  .volume { width: 128px; flex: none; }
  /* the time: at rest a 4px strip, the elapsed part in the foreground colour; the full row while the strip itself is
     hovered (its hit area reaches 8px above it) or the seek slider is focused */
  .time { position: relative; display: flex; align-items: center; gap: 8px; padding: 0 8px; height: 4px; background: var(--bg); overflow: hidden; box-sizing: border-box; transition: height 150ms, padding 150ms; }
  .time::before { content: ''; position: absolute; left: 0; right: 0; top: -8px; height: 8px; }
  .time .t { font-variant-numeric: tabular-nums; white-space: nowrap; opacity: 0; transition: opacity 150ms; }
  .time .seek { flex: 1; min-width: 0; padding: 0; height: 4px; }
  .time .seek::-webkit-slider-runnable-track { background: linear-gradient(to right, var(--fg) var(--p, 0%), var(--bg) var(--p, 0%)); }
  .time .seek::-webkit-slider-thumb { opacity: 0; }
  .time:hover, .time:focus-within { height: 36px; padding: 8px; }
  .time:hover .t, .time:focus-within .t { opacity: 1; }
  .time:hover .seek, .time:focus-within .seek { padding: 4px 0; height: 12px; }
  .time:hover .seek::-webkit-slider-runnable-track, .time:focus-within .seek::-webkit-slider-runnable-track { background: linear-gradient(to right, var(--primary) var(--p, 0%), var(--muted) var(--p, 0%)); }
  .time:hover .seek::-webkit-slider-thumb, .time:focus-within .seek::-webkit-slider-thumb { opacity: 1; }
  @media (prefers-reduced-motion: reduce) { .dock, .time, .time .t { transition: none; } }
  /* the menu: same width, tone and type as the top-right panel, as tall as its items, sitting on the bar's right end */
  .menu-panel {
    --s: clamp(0.5px, 100vw / 1600, 1px);
    position: fixed; right: 0; bottom: var(--botbar, 0px); width: min(80vw, calc(340 * var(--s))); box-sizing: border-box;
    display: flex; flex-direction: column; gap: calc(4 * var(--s)); padding: calc(16 * var(--s)) calc(20 * var(--s));
    background: rgba(0, 0, 0, 0.78); color: #fff; font-size: calc(24 * var(--s)); letter-spacing: .08em; text-transform: uppercase; user-select: none;
    transform: translateX(100%); pointer-events: none; transition: transform 320ms cubic-bezier(.2,.8,.2,1); z-index: 2;
  }
  .menu-panel.open { transform: translateX(0); pointer-events: auto; }
  .menu-panel button { all: unset; cursor: pointer; padding: calc(12 * var(--s)) calc(16 * var(--s)); border-radius: 3px; opacity: .7; }
  .menu-panel button:hover { background: #ffffff14; opacity: 1; }
  .menu-panel button.on { opacity: 1; background: #ffffff1c; }
  .rule { height: 1px; background: #fff2; margin: calc(8 * var(--s)) calc(16 * var(--s)); }
  /* play order: one row of equal options, the chosen one solid like the top bar's */
  .orders { display: grid; grid-template-columns: repeat(3, 1fr); gap: calc(8 * var(--s)); padding: calc(4 * var(--s)) 0; }
  .menu-panel .orders button { display: flex; justify-content: center; padding: calc(8 * var(--s)) 0; border: 1px solid #fff5; }
  .menu-panel .orders button.on { background: #fff; color: #000; border-color: #fff; }
  @media (max-width: 700px) {
    .menu-panel { width: min(80vw, calc(600 * var(--s))); font-size: calc(40 * var(--s)); gap: calc(8 * var(--s)); }
    .menu-panel button { padding: calc(20 * var(--s)) calc(24 * var(--s)); }
    .volume { width: 72px; } /* phones: the three thirds still fit */
  }
</style>
