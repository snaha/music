<script lang="ts">
  import { keyboardScope } from './keyboard';
  import { onMount } from 'svelte';
  import { fly } from 'svelte/transition';
  import { jump, moveQueue, removeQueue, player } from './player.svelte';
  let { onclose, palette }: { onclose: () => void; palette: string } = $props();
  let closeButton: HTMLButtonElement;
  const fmt = (s = 0) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  function close() { onclose(); player.topHidden = true; }
  onMount(() => {
    const previous = document.activeElement as HTMLElement | null;
    closeButton.focus({ preventScroll: true });
    return () => { if (previous?.isConnected && (document.activeElement === document.body || closeButton.closest('.now-playing')?.contains(document.activeElement))) previous.focus({ preventScroll: true }); };
  });
</script>


<section class="now-playing" style={palette} aria-label="Now playing and queue" use:keyboardScope={event => {
  if (event.defaultPrevented) return;
  if ((event.target as HTMLElement).closest('.select-song') && !event.altKey && !event.ctrlKey && !event.metaKey && ['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) {
    event.preventDefault(); event.stopPropagation();
    const tracks = [...(event.currentTarget as HTMLElement).querySelectorAll<HTMLButtonElement>('.select-song')];
    const index = tracks.indexOf(document.activeElement as HTMLButtonElement);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? tracks.length - 1 : Math.max(0, Math.min(tracks.length - 1, index + (event.key === 'ArrowDown' ? 1 : -1)));
    tracks[next]?.focus(); return;
  }
  if (event.key !== 'Escape') return;
  event.preventDefault(); event.stopPropagation();
  if (player.shortcutsOpen) { player.shortcutsOpen = false; return; }
  const expanded = (event.target as HTMLElement).closest<HTMLDetailsElement>('details[open]');
  if (expanded) { expanded.open = false; expanded.querySelector<HTMLElement>('summary')?.focus(); }
  else close();
}} in:fly={{ y: reduced ? 0 : 24, duration: reduced ? 0 : 260 }} out:fly={{ y: reduced ? 0 : 12, duration: reduced ? 0 : 140 }}>
  <header>
    <button class="close" bind:this={closeButton} onclick={close} aria-label="Close now playing"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg></button>
    <span>Now playing</span>
    <span class="count">{player.queue.length} tracks</span>
  </header>
  <div class="content">
    <div class="artwork">
      {#if player.song}
        {#key player.song.cover}
          <img src={player.song.cover} alt="{player.song.album || player.song.title} cover" />
        {/key}
        <div class="album-meta"><h1>{player.song.album || player.song.title}</h1><p>{player.song.artist}</p></div>
      {:else}
        <div class="empty-art"><svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true"><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="2" /></svg></div>
        <div class="album-meta"><h1>Your queue</h1><p>Choose a track to start listening.</p></div>
      {/if}
    </div>
    <div class="list" aria-label="Queued tracks">
      <h2>Queue <span>· {player.queue.length}</span></h2>
      {#if !player.queue.length}<p class="empty">Add an album or playlist with the + on its cover.</p>{/if}
      {#each player.queue as song, i (`${i}:${song.id}`)}
        <div class="song" class:current={i === player.index}>
          <button class="select-song" onclick={() => jump(i)} aria-label="Play {song.title}" aria-current={i === player.index ? 'true' : undefined}>
            <span class="n">{#if i === player.index}<svg viewBox="0 0 20 20" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M3 6h2v8H3zM7 3h2v14H7zM11 7h2v6h-2zM15 5h2v10h-2z" /></svg>{:else}{i + 1}{/if}</span>
            <span class="t">{song.title}<small>{song.artist} · {song.source}{song.available ? '' : ' · unavailable'}</small></span>
            <span class="d">{fmt(song.duration)}</span>
          </button>
          <details class="track-menu">
            <summary aria-label="Actions for {song.title}"><svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="19" cy="12" r="1.5" /></svg></summary>
            <div class="queue-actions">
              <button onclick={() => moveQueue(i, i - 1)} disabled={i === 0} aria-label="Move {song.title} up">Move up</button>
              <button onclick={() => moveQueue(i, i + 1)} disabled={i === player.queue.length - 1} aria-label="Move {song.title} down">Move down</button>
              <button onclick={() => removeQueue(i)} aria-label="Remove {song.title}">Remove</button>
            </div>
          </details>
        </div>
      {/each}
    </div>
  </div>
</section>

<style>
  .now-playing { position: fixed; inset: var(--browsebar, 0px) 0 var(--botbar, 76px); z-index: 2; display: flex; flex-direction: column; color: var(--play-text); background: var(--play-surface); font: 14px/1.5 var(--ui-font); transition: background-color 300ms ease-out, color 300ms ease-out; }
  header { display: flex; align-items: center; gap: 12px; min-height: 56px; padding: 0 24px; border-bottom: 1px solid var(--play-line); flex-shrink: 0; }
  header > span:first-of-type { font-weight: 600; }
  .count { margin-left: auto; color: var(--play-muted); font-size: 12px; font-variant-numeric: tabular-nums; }
  button, summary { color: inherit; font: inherit; cursor: pointer; }
  .close { display: grid; place-items: center; width: 44px; height: 44px; padding: 0; background: transparent; border: 0; border-radius: 4px; }
  button:focus-visible, summary:focus-visible { outline: 2px solid var(--play-accent); outline-offset: -2px; }
  .close:hover, summary:hover { background: var(--play-line); }
  .content { display: grid; grid-template-columns: minmax(240px, .85fr) minmax(0, 1.15fr); gap: clamp(32px, 5vw, 80px); padding: clamp(24px, 4vw, 64px); min-height: 0; flex: 1; max-width: 1500px; width: 100%; box-sizing: border-box; align-self: center; }
  .artwork { min-height: 0; display: flex; flex-direction: column; align-items: flex-start; gap: 20px; overflow-y: auto; scrollbar-width: thin; scrollbar-color: var(--play-line) transparent; }
  .artwork img, .empty-art { width: 100%; max-height: min(52vh, 560px); aspect-ratio: 1; object-fit: contain; object-position: left center; display: block; }
  .empty-art { background: var(--play-bar); display: grid; place-items: center; }
  h1 { font-size: clamp(20px, 2vw, 30px); line-height: 1.2; letter-spacing: -.025em; font-weight: 600; margin: 0 0 8px; overflow-wrap: anywhere; }
  .album-meta p { margin: 0; color: var(--play-muted); font-size: 16px; }
  .list { overflow-y: auto; min-height: 0; scrollbar-width: thin; scrollbar-color: var(--play-line) transparent; padding-right: 8px; }
  h2 { font-size: 16px; font-weight: 600; margin: 0 0 16px; }
  h2 span { color: var(--play-muted); font-weight: 400; }
  .song { display: flex; align-items: center; border-bottom: 1px solid var(--play-line); gap: 4px; position: relative; }
  .song.current { background: var(--play-bar); color: var(--play-accent); }
  .song:hover, .song:focus-within { background: var(--play-line); }
  .select-song { border: 0; background: transparent; display: grid; grid-template-columns: 28px minmax(0, 1fr) auto; gap: 14px; min-height: 64px; align-items: center; flex: 1; min-width: 0; padding: 10px 8px; text-align: left; }
  .n { color: var(--play-muted); font-size: 12px; font-variant-numeric: tabular-nums; display: grid; place-items: center; }
  .current .n { color: var(--play-accent); }
  .t { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 550; }
  .t small { display: block; font-size: 12px; color: var(--play-muted); font-weight: 400; margin-top: 3px; overflow: hidden; text-overflow: ellipsis; }
  .d { color: var(--play-muted); font-size: 12px; font-variant-numeric: tabular-nums; }
  .track-menu { flex-shrink: 0; align-self: stretch; }
  summary { display: grid; place-items: center; list-style: none; width: 44px; height: 100%; min-height: 44px; }
  summary::-webkit-details-marker { display: none; }
  .queue-actions { position: absolute; right: 0; top: 48px; z-index: 1; background: var(--play-bar); padding: 6px; min-width: 144px; box-shadow: 0 8px 24px #0003; }
  .queue-actions button { display: block; width: 100%; text-align: left; border: 0; background: transparent; padding: 10px 12px; min-height: 44px; }
  .queue-actions button:hover { background: var(--play-line); }
  .queue-actions button:disabled { opacity: .45; cursor: default; }
  .empty { color: var(--play-muted); }
  ::selection { color: var(--play-bar); background: var(--play-accent); }
  @media (max-width: 700px) {
    header { padding: 0 12px; min-height: 48px; }
    .content { display: block; padding: 20px 16px; overflow-y: auto; scrollbar-width: thin; scrollbar-color: var(--play-line) transparent; }
    .artwork { overflow: visible; align-items: center; gap: 16px; }
    .artwork img, .empty-art { width: min(100%, 280px); max-height: none; }
    .album-meta { width: 100%; margin-bottom: 28px; }
    .album-meta p { font-size: 14px; }
    .list { overflow: visible; padding: 0; }
    .select-song { grid-template-columns: 20px minmax(0, 1fr) auto; gap: 8px; }
  }
  @media (prefers-reduced-motion: reduce) { .now-playing { transition: none; } }
</style>
