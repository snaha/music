<script lang="ts">
  import { Spring } from 'svelte/motion';
  import { library, MODES, setMode, type Tile } from './library.svelte';
  import { player } from './player.svelte';
  import { session } from './api.svelte';
  import Side from './Side.svelte';
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
  // 3d: the grid lies on a plane tilted back from the bottom edge and scrolls away into the distance, like a title crawl
  // it has variations to try, picked in the 3d control set
  const VIEWS = { off: 'Off', grid: 'Grid', jukebox: 'Jukebox', flow: 'Cover flow' } as const;
  const saved3d = localStorage.getItem('grid.3d') ?? '';
  let view3d = $state<keyof typeof VIEWS>(saved3d in VIEWS ? (saved3d as keyof typeof VIEWS) : saved3d === '1' ? 'grid' : 'off');
  let tilt = $derived(view3d !== 'off');
  // the material never rides the tilted plane: textured, every tile of that huge plane has to be drawn, far more than the
  // GPU keeps, so it redraws them all on every frame (~250ms). It stays on the screen behind the plane instead
  let onCards = $derived(bg.scroll && !tilt);
  // loop: the tilted grid never ends, past the last album it starts again from the first
  let loop = $state(localStorage.getItem('grid.loop') === '1');
  // inf: with loop on, the columns repeat sideways too, so the plane has no edge in any direction. Only for the look:
  // the plane moves along its length only
  let inf = $state(localStorage.getItem('grid.inf') === '1');
  // jukebox: a single row up the plane. The covers do not lie on it: each is tipped up off it, over the one behind
  let jukebox = $derived(view3d === 'jukebox');
  // cover flow: a single row across the screen that scrolls sideways. The middle cover faces front, the rest are turned
  // toward it in a stack on either side
  let flow = $derived(view3d === 'flow');
  let single = $derived(jukebox || flow);
  // reflect: the covers of a single row mirror faintly in the floor under them
  let reflect = $state(localStorage.getItem('grid.reflect') === '1');
  // which set of controls the top bar shows
  const SETS = { layout: 'Layout', look: 'Look', three: '3D', search: 'Search' } as const;
  let set = $state((localStorage.getItem('set') as keyof typeof SETS) || 'layout');
  $effect(() => {
    localStorage.setItem('grid.cols', String(cols)); localStorage.setItem('grid.gap', String(gap));
    localStorage.setItem('art', art ? '1' : '0'); localStorage.setItem('motion', motion ? '1' : '0');
    localStorage.setItem('grid.3d', view3d); localStorage.setItem('grid.reflect', reflect ? '1' : '0'); localStorage.setItem('grid.loop', loop ? '1' : '0');
    localStorage.setItem('grid.inf', inf ? '1' : '0');
    localStorage.setItem('set', set);
  });
  // the covers' paper grain is a bitmap made once. As an svg noise filter it was computed again for every cover drawn:
  // a quarter of the GPU's drawing time while the 3d grid scrolls
  let paper = $state('none');
  {
    const c = document.createElement('canvas'), g = c.getContext('2d')!;
    c.width = c.height = 160;
    const px = g.createImageData(160, 160);
    for (let i = 0; i < px.data.length; i += 4) { px.data[i] = px.data[i + 1] = px.data[i + 2] = 255; px.data[i + 3] = Math.random() * 13; } // white, up to 5%
    g.putImageData(px, 0, 0);
    c.toBlob((b) => { if (b) paper = `url(${URL.createObjectURL(b)})`; });
  }
  // Navidrome >= 0.64 omits coverArt when no image exists, so an empty cover URL means no art
  // the playing album always shows, even without art, so it can be found and scrolled to
  // search set: filter as you type over title and subtitle (artist name for albums)
  let query = $state('');
  let shown = $derived.by(() => {
    const q = query.trim().toLowerCase();
    return tiles.filter((t) => (!art || t.cover || t.id === activeId) && (!q || `${t.title} ${t.sub}`.toLowerCase().includes(q)));
  });
  $effect(() => { library.visible = shown; });
  // looping: the last row is completed with the first albums so rows line up across the seam (a few show twice)
  let looping = $derived(tilt && loop && shown.length > 0);
  let wrapping = $derived(looping && inf && !single);
  let across = $derived(single ? 1 : cols);
  let rows = $derived(Math.ceil(shown.length / across));

  // when the playing album changes (random queue, next track), bring its cover into view
  // that scroll is not the user's: on touch it must not show or hide the top bar, so it is ignored until the next touch
  let scroller: HTMLDivElement, autoScroll = false;
  $effect(() => {
    if (!activeId) return;
    autoScroll = true;
    requestAnimationFrame(() => {
      if (!tilt) return scroller?.querySelector('.tile.active')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      // on the tilted plane the scroll is the distance along it: bring the cover to the middle of the plane, the nearest
      // way round when it loops
      const i = shown.findIndex((t) => t.id === activeId);
      if (i < 0) return;
      const round = (d: number, p: number) => (p ? mod(d + p / 2, p) - p / 2 : d);
      // in a single row it comes to the front, or the middle, of the row
      const to = single ? i * pitch : pad + Math.floor(i / cols) * pitch + tile / 2 - viewH / 2;
      scroller.scrollBy({ [flow ? 'left' : 'top']: round(to - offset, looping ? period : 0), behavior: 'smooth' });
    });
  });
  // 3d: a sticky stage holds the plane in view while a spacer gives the page its scroll length, so native scrolling
  // (wheel, touch, scrollbar keys) still drives it; the plane slides along itself by the scroll distance.
  // Only the covers on screen exist, placed one by one: rows up to DEPTH screens up the plane (deeper they are specks
  // under the top bar, and a plane that big overflows what the GPU keeps, so every frame redraws it), and on each row
  // the columns the view spans at that depth
  // scrollTop is the scroll distance along the plane or the row: cover flow scrolls sideways, there it is the scrollLeft
  let scrollTop = $state(0), viewH = $state(0), viewW = $state(0);
  const pos = () => (flow ? scroller.scrollLeft : scroller.scrollTop);
  const seek = (v: number) => { if (flow) scroller.scrollLeft = v; else scroller.scrollTop = v; scrollTop = pos(); };
  const DEPTH = 5, SPAN = 1e7, TILT = 58, SIN = Math.sin((TILT * Math.PI) / 180);
  // jukebox: how far a cover is tipped up off the plane, and the distance between covers as a part of their size
  const LIFT = 22, STEP = 0.6, BASE = 140; // BASE: the front cover stands clear of the player bar
  // cover flow: how far the side covers are turned, and as parts of the cover size: the gap beside the middle cover,
  // the distance between covers in a stack, and how far back the stacks stand
  const TURN = 68, MID = 0.72, SIDE = 0.2, BACK = 0.45;
  // the plane is wider than the screen so its far end still fills the width; its sides run off the bottom corners
  let planeW = $derived(1.6 * viewW);
  let pad = $derived(Math.max(0.2, (gap * viewW) / 3312)); // the grid's --gap
  let tile = $derived(flow ? Math.min(viewW * 0.4, viewH * 0.5) : jukebox ? Math.min(viewW * 0.5, viewH * 0.8) : (planeW - (cols + 1) * pad) / cols);
  let pitch = $derived(flow ? tile * SIDE * 1.5 : jukebox ? tile * STEP : tile + pad);
  let period = $derived(rows * pitch);
  const mod = (a: number, n: number) => ((a % n) + n) % n;
  // looping: the page gets a scroll length nobody reaches the end of and the plane moves by the scroll modulo one pass
  // through the library, so the wrap never touches the scroll position and momentum carries straight through it
  let offset = $derived(looping ? mod(scrollTop, period) : scrollTop);
  const middle = (p: number) => SPAN / 2 - mod(SPAN / 2, p);
  // a loop that starts at the top of the page (a reload, a mode change) moves to the middle: whole passes, same view
  $effect(() => { if (looping && pos() < period) seek(pos() + middle(period)); });
  // switching loop keeps the covers on screen where they are
  function setLoop(on: boolean) {
    const at = offset;
    loop = on;
    requestAnimationFrame(() => seek(looping ? middle(period) + at : at));
  }
  // switching between the 3d views keeps the album at the front where it is, like loop keeps the covers on screen
  function setView(v: keyof typeof VIEWS) {
    const i = tilt ? Math.round(offset / pitch) * across : -1;
    view3d = v;
    requestAnimationFrame(() => {
      if (i >= 0 && !tilt) scroller.querySelectorAll('.tile')[i % shown.length]?.scrollIntoView({ block: 'center' });
      if (i < 0 || !tilt) return void (scrollTop = pos());
      const at = Math.floor(i / across) * pitch;
      seek(looping ? middle(period) + at : at);
    });
  }
  // single row: the covers in view, each with its place p in the row counted in covers from the front one (jukebox) or
  // the middle one (cover flow). In the jukebox the one before the front (p < 0) is the cover leaving the row
  let discs = $derived.by(() => {
    const n = shown.length, out: { key: number; t: Tile; p: number }[] = [];
    if (!single || !n || !(pitch > 0)) return out;
    const at = offset / pitch, side = Math.ceil(viewW / 2 / (SIDE * tile)) + 2;
    let k0 = Math.floor(at) - (flow ? side : 0), k1 = flow ? Math.ceil(at) + side : Math.floor((offset + DEPTH * viewH) / pitch);
    if (!looping) { k0 = Math.max(0, k0); k1 = Math.min(n - 1, k1); }
    const kr = looping ? Math.floor(scrollTop / period) * n : 0;
    for (let k = k0; k <= k1; k++) out.push({ key: k + kr, t: shown[mod(k, n)], p: k - at });
    return out;
  });
  // the line on screen the front cover stands on. Cover flow is seen from the covers' mid-height, as in iTunes: the
  // side covers narrow evenly above and below, and their bottom edges rise toward the middle
  let floorY = $derived(flow ? (viewH + tile) / 2 - 20 : viewH - BASE);
  // where a cover of the row stands. Nearer covers paint over farther ones
  function pose(p: number) {
    if (flow) {
      const t = Math.max(-1, Math.min(1, p)); // the turn happens within one place of the middle
      return { z: -Math.round(Math.abs(p) * 10), o: 1, origin: '50% 50%',
        tf: `translateX(${(t * MID + (p - t) * SIDE) * tile}px) translateZ(${-Math.abs(t) * BACK * tile}px) rotateY(${-t * TURN}deg)` };
    }
    // hinged on its bottom edge: moved up the tilted plane, then tipped up off it. Passing the front it slides on down
    // off the screen and fades, gone by the time it is dropped
    const d = p * pitch;
    return { z: -Math.round(p), o: 1 - Math.max(0, -p), origin: '50% 100%',
      tf: `rotateX(${TILT}deg) translateY(${d < 0 ? -2 * d : -d}px) rotateX(${-LIFT}deg)` };
  }
  // cover flow comes to rest on a cover
  function onscrollend() {
    if (!flow || !(pitch > 0)) return;
    const to = Math.round(pos() / pitch) * pitch;
    if (Math.abs(to - pos()) > 1) scroller.scrollTo({ left: to, behavior: 'smooth' });
  }
  // the rows on screen with their covers. Keys count whole passes too, so crossing a seam keeps every node.
  // Each row is a layer of its own, and a far row is drawn small and scaled back up (k): it shows at a fraction of its
  // size, and at full size the rows together are more than the GPU keeps (240 MB at 2880x1742), so parts go undrawn
  // ponytail: a row is redrawn when it crosses a step. Add hysteresis if scrolling back and forth over one shows
  let bands = $derived.by(() => {
    const n = shown.length, out: { key: number; y: number; k: number; cells: { c: number; t: Tile; x: number }[] }[] = [];
    if (!tilt || single || !n || !(pitch > 0)) return out;
    let r0 = Math.floor((offset + viewH * (1 - DEPTH) - pad) / pitch), r1 = Math.floor((offset + viewH) / pitch); // rows past the bottom edge are off screen, and partly behind the camera,
    // where they break the browser's drawing and hit testing of the whole plane
    if (!looping) { r0 = Math.max(0, r0); r1 = Math.min(rows - 1, r1); }
    const kr = looping ? Math.floor(scrollTop / period) * rows : 0;
    const xc = planeW / 2; // the plane point at the middle of the screen
    for (let r = r0; r <= r1; r++) {
      // size: how large the row shows, 1 at the bottom edge. Perspective is one screen height, the origin mid-screen
      const d = Math.max(0, offset + viewH - (pad + r * pitch + tile / 2));
      const size = 1 / (1 + (d * SIN) / viewH), k = size > 0.6 ? 1 : size > 0.3 ? 2 : 4, cells = [];
      // the view widens with the distance up the plane. A row holds the columns in view at the far end of its step, so
      // they change only when it is redrawn anyway: dropping them one by one as it nears redraws it each time
      const half = viewW / 2 / (k === 1 ? 0.6 : k === 2 ? 0.3 : 1 / (1 + DEPTH * SIN)) + pitch;
      let c0 = Math.floor((xc - half - pad) / pitch), c1 = Math.floor((xc + half) / pitch);
      if (!wrapping) { c0 = Math.max(0, c0); c1 = Math.min(cols - 1, c1); }
      for (let c = c0; c <= c1; c++) {
        const i = mod(r, rows) * cols + mod(c, cols);
        if (!looping && i >= n) break;
        cells.push({ c, t: shown[i % n], x: pad + c * pitch });
      }
      out.push({ key: r + kr, y: pad + r * pitch, k, cells });
    }
    return out;
  });
  // the plane's shift along itself: scroll plus the mouse drift
  let shiftX = $derived(drift.current.x * -8), shiftY = $derived(-offset + drift.current.y * -6);

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
  $effect(() => { document.documentElement.style.setProperty('--topbar', `${barHeight}px`); });
  $effect(() => { document.documentElement.style.setProperty('--sidebar', `${rightOpen && !touch ? sideWidth : 0}px`); });
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
    const top = (e.currentTarget as HTMLElement).scrollTop;
    if (tilt) scrollTop = pos();
    if (!touch) return;
    if (!autoScroll && Math.abs(top - lastTop) > 4) near = top < lastTop ? 1 : 0;
    lastTop = top;
  }
</script>

<!-- an image dropped anywhere becomes the custom background -->
<svelte:window onpointermove={onmove} {ontouchstart} onpointerdowncapture={() => (wasHidden = hidden)}
  ondragover={(e) => e.preventDefault()} ondrop={(e) => { e.preventDefault(); const f = e.dataTransfer?.files[0]; if (f) importBackground(f); }} />

<!-- the visualizer as background sits behind everything; the fullscreen one replaces it while open -->
{#if bg.material === 'viz' && !player.visOpen}<Visualizer background />{/if}

<!-- the material sits on the cards' layer so it scrolls and drifts with them, or on the fixed viewport behind them -->
<!-- ponytail: a mouse wheel moves cover flow by its raw steps, no easing. Ease it if a notch feels abrupt -->
<div class="scroll" class:tilt class:flow {onscrollend} onwheel={(e) => { if (flow && !e.deltaX) scroller.scrollLeft += e.deltaY; }} class:fill={!bg.tile} class:m-vinyl={!onCards && bg.material === 'vinyl'} class:m-grille={!onCards && bg.material === 'grille'}
  class:m-fabric={!onCards && bg.material === 'fabric'} class:m-custom={!onCards && bg.material === 'custom'} style:--custom={bg.custom ? `url("${bg.custom}")` : 'none'} style:--paper={paper} {onscroll} bind:this={scroller} bind:clientHeight={viewH} bind:clientWidth={viewW}>
  <div class="stage" class:tilt class:flow style:perspective-origin={flow ? `50% ${floorY - tile / 2}px` : null}>
  {#if single}
    <!-- jukebox and cover flow: every cover is its own small layer -->
    {#each discs as { key, t, p } (key)}
      {@const at = pose(p)}
      <button class="tile disc" class:reflect={reflect && (flow || p < 1)} class:active={t.id === activeId} style:width="{tile}px" style:left="{(viewW - tile) / 2}px" style:top="{floorY - tile}px"
        style:z-index={at.z} style:opacity={at.o} style:transform-origin={at.origin} style:transform={at.tf} onclick={() => pick(t)} aria-label="{t.title} — {t.sub}">
        <!-- ponytail: the grid's 300px thumbnail, soft on the front cover. Ask for a larger size for the near ones if it bothers -->
        <img src={t.cover} alt={t.title} draggable="false" />
        <i></i>
        <!-- the mirror image is a second, flipped image under the cover with a plain gradient over it, painted once into
          the cover's own layer. The browser's reflection with a fade mask costs an offscreen pass per cover per frame
          (2 fps), and without the mask it cannot follow the slanted bottom edges -->
        {#if reflect && (flow || p < 1)}<span class="mirror"><img src={t.cover} alt="" draggable="false" /></span>{/if}
      </button>
    {/each}
    <!-- the mirror images fade to black, so the floor under the row is black too: the background fades into it behind the covers -->
    {#if reflect}<div class="floor" style:--from="{floorY - tile * (flow ? 1 : 0.5)}px" style:--to="{floorY - tile * (flow ? 0.2 : 0)}px"></div>{/if}
  {:else if tilt}
    <!-- 3d: the plane, hinged at the bottom edge of the screen -->
    <div class="plane" style:width="{planeW}px" style:left="{(viewW - planeW) / 2}px" style:transform-origin="{planeW / 2}px {viewH}px"
      style:transform="rotateX({TILT}deg) translate3d({shiftX}px, {shiftY}px, 0)">
      {#each bands as { key, y, k, cells } (key)}
        <!-- zoom shrinks the row and all in it, shadows too, so scaled back up it looks the same; its own top is zoomed as well -->
        <div class="band" style:zoom={1 / k} style:top="{y * k}px" style:transform="scale({k})">
          {#each cells as { c, t, x } (c)}
            <button class="tile" class:active={t.id === activeId} style:left="{x}px" style:width="{tile}px" onclick={() => pick(t)} aria-label="{t.title} — {t.sub}">
              <img src={t.cover} alt={t.title} draggable="false" />
              <i></i>
            </button>
          {/each}
        </div>
      {/each}
    </div>
  {:else}
  <div class="grid" class:m-vinyl={onCards && bg.material === 'vinyl'} class:m-grille={onCards && bg.material === 'grille'}
    class:m-fabric={onCards && bg.material === 'fabric'} class:m-custom={onCards && bg.material === 'custom'} style:--cols={cols} style:--gap="max(0.2px, calc({gap} * var(--u)))"
    style:transform="translate3d({drift.current.x * -8}px, {drift.current.y * -6}px, 0)">
    {#each shown as t (t.id)}
      <button class="tile" class:active={t.id === activeId} onclick={() => pick(t)} aria-label="{t.title} — {t.sub}">
        <img src={t.cover} alt={t.title} loading="lazy" draggable="false" />
        <i></i>
      </button>
    {/each}
  </div>
  {/if}
  </div>
  <!-- the plane's end rests halfway up the screen; looping, the scroll length has no reachable end -->
  {#if flow}<div style:width="{viewW + (looping ? SPAN : (rows - 1) * pitch)}px"></div>
  {:else if tilt}<div style:height="{looping ? SPAN : jukebox ? (rows - 1) * pitch : Math.max(0, pad + rows * pitch + 140 - viewH / 2)}px"></div>{/if}
</div>

<div class="controls" role="toolbar" tabindex="-1" aria-label="Controls" class:hidden={!barShown} class:lit style:--chrome={chrome} style:pointer-events={barShown && chrome > 0.05 ? 'auto' : 'none'}
  bind:clientHeight={barHeight} onpointerenter={() => (overChrome = !touch)} onpointerleave={() => (overChrome = false)}>
  {#if set === 'layout'}
    <label>columns <input type="range" min="1" max="10" bind:value={cols} /> {cols}</label>
    <label>gap <input type="range" min="0" max="160" bind:value={gap} /> {gap}</label>
  {:else if set === 'three'}
    <span class="group" role="radiogroup" aria-label="3D view">
      <span class="name">3d</span>
      {#each Object.entries(VIEWS) as [key, label] (key)}
        <button class="opt" class:on={view3d === key} role="radio" aria-checked={view3d === key} onclick={() => setView(key as keyof typeof VIEWS)}>{label}</button>
      {/each}
    </span>
    {#if tilt}<button class="opt" class:on={loop} aria-pressed={loop} onclick={() => setLoop(!loop)}>loop</button>{/if}
    {#if single}<button class="opt" class:on={reflect} aria-pressed={reflect} onclick={() => (reflect = !reflect)}>reflect</button>{/if}
    {#if view3d === 'grid' && loop}<button class="opt" class:on={inf} aria-pressed={inf} onclick={() => (inf = !inf)}>inf</button>{/if}
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
      <button role="menuitem" tabindex={leftOpen ? 0 : -1} class:on={library.mode === m} onclick={() => { setMode(m); leftMenu = false; }}>{m}</button>
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

{#if player.view === 'settings'}<Settings bind:art bind:motion onclose={() => (player.view = '')} />{/if}

<style>
  .scroll {
    --u: calc(100vw / 3312); position: fixed; inset: 0; overflow-y: auto; overflow-x: hidden; scrollbar-width: thin; scrollbar-color: #333 #000; scrollbar-gutter: stable both-edges;
    /* built-in materials: each is grain + a structure + the same two diagonal light bands */
    --grain: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 0.09 0'/%3E%3C/filter%3E%3Crect width='200' height='200' filter='url(%23n)'/%3E%3C/svg%3E") 0 0 / 200px 200px;
    --sheen: repeating-linear-gradient(105deg, #fff0 0, #ffffff0a 160px, #ffffff16 270px, #ffffff0a 380px, #fff0 520px,
        #fff0 780px, #ffffff0a 920px, #ffffff16 1030px, #ffffff0a 1140px, #fff0 1300px, #fff0 1400px);
  }
  .grid { display: grid; grid-template-columns: repeat(var(--cols), 1fr); gap: var(--gap); padding: var(--gap) var(--gap) 140px; min-height: 100%; box-sizing: border-box; will-change: transform; }
  .stage { display: contents; }
  /* the tilted plane runs to both screen edges: no scrollbar or reserved gutter strips; the plane itself shows the motion */
  .scroll.tilt { scrollbar-width: none; scrollbar-gutter: auto; }
  .scroll.flow { overflow-x: auto; overflow-y: hidden; }
  /* 3d stage: pinned to the viewport, rows darken toward the vanishing point. Perspective and tilt set the steepness;
     the plane's horizon sits just above the top edge */
  .stage.tilt { display: block; position: sticky; top: 0; left: 0; height: 100%; overflow: hidden; perspective: 100vh; }
  /* ponytail: a screen-space shade, so it also darkens the background in the top corners the plane leaves bare */
  .stage.tilt:not(.flow)::after { content: ''; position: absolute; inset: 0; pointer-events: none; background: linear-gradient(to bottom, #000b 0, #0000 45%); }
  .plane { position: absolute; top: 0; height: 0; will-change: transform; }
  .band { position: absolute; left: 0; transform-origin: 0 0; will-change: transform; }
  /* the covers move under a resting pointer: an eased hover would redraw their row on every frame of every ease */
  .plane .tile { position: absolute; top: 0; transition: none; }
  .plane .tile i { transition: none; }
  /* the scroll sets the transform every frame, so it must not ease */
  .tile.disc.reflect { overflow: visible; }
  .mirror { position: absolute; left: 0; top: calc(100% + 2px); width: 100%; height: 45%; overflow: hidden; pointer-events: none; }
  .tile .mirror img { height: auto; aspect-ratio: 1; transform: scaleY(-1); }
  .mirror::after { content: ''; position: absolute; inset: 0; background: linear-gradient(#000c, #000); }
  .floor { position: absolute; inset: 0; z-index: -1000; pointer-events: none; background: linear-gradient(#0000 var(--from), #000 var(--to)); }
  .tile.disc { position: absolute; transition: box-shadow 200ms; will-change: transform; }
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
  /* the radius is spelled out, not inherited: a child that inherits explicitly is restyled whenever its tile's style changes,
     which in the single-row 3d views is every frame. That restyle re-resolves the grain image and repaints the cover:
     measured 26 fps against 53 in cover flow */
  .tile i { position: absolute; inset: 0; border-radius: 1px; pointer-events: none;
    background:
      var(--paper) 0 0 / 160px 160px,
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
