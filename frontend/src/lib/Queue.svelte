<script lang="ts">
  import Drawer from './Drawer.svelte';
  import { jump, moveQueue, removeQueue, player } from './player.svelte';

  let { onclose }: { onclose: () => void } = $props();
  const fmt = (s = 0) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
</script>

<!-- closing with the handle keeps the top bar hidden until the next interaction -->
<Drawer onclose={() => { onclose(); player.topHidden = true; }}>
  <div class="list">
    <p class="queue-heading">Queue · {player.queue.length} tracks</p>
    {#if !player.queue.length}<p>Add an album or playlist with the + on its cover.</p>{/if}
    {#each player.queue as s, i (`${i}:${s.id}`)}
      <div class="song" class:current={i === player.index}>
        <button class="select-song" onclick={() => jump(i)} aria-label="Play {s.title}">
          <span class="n">{i + 1}</span>
          <span class="t">{s.title}<small>{s.artist} · {s.source}{s.available ? '' : ' · unavailable'}</small></span>
          <span class="d">{fmt(s.duration)}</span>
        </button>
        <span class="queue-actions">
          <button onclick={() => moveQueue(i, i - 1)} disabled={i === 0} aria-label="Move {s.title} up">↑</button>
          <button onclick={() => moveQueue(i, i + 1)} disabled={i === player.queue.length - 1} aria-label="Move {s.title} down">↓</button>
          <button onclick={() => removeQueue(i)} aria-label="Remove {s.title}">×</button>
        </span>
      </div>
    {/each}
  </div>
</Drawer>

<style>
  .queue-heading { opacity: .7; }
  .select-song { all: unset; display: grid; grid-template-columns: 32px 1fr auto; align-items: center; gap: 16px; flex: 1; min-width: 0; cursor: pointer; }
  .queue-actions { display: flex; gap: 6px; }
  .queue-actions button { background: #222; border: 1px solid #555; border-radius: 3px; color: #ddd; padding: 5px 8px; cursor: pointer; }
  .queue-actions button:disabled { opacity: .25; cursor: default; }
  .list { font-size: calc(16 * var(--s)); overflow-y: auto; padding: calc(8 * var(--s)) calc(24 * var(--s)) calc(24 * var(--s)); scrollbar-width: thin; scrollbar-color: #333 #0000; }
  .song {
    display: flex; align-items: center; gap: calc(16 * var(--s));
    width: 100%; box-sizing: border-box; padding: calc(10 * var(--s)) calc(12 * var(--s)); border-radius: 2px; color: #bbb;
  }
  .song:hover, .song:focus-within { background: rgba(0, 0, 0, 0.35); color: #fff; }
  /* current: darker than the panel, with the cards' glassy sheen and edge light */
  .song.current {
    color: #fff; border-radius: 0;
    /* full panel width: cancel the list's side padding and keep the text aligned */
    margin: 0 calc(-24 * var(--s)); width: calc(100% + 48 * var(--s));
    padding: calc(10 * var(--s)) calc(36 * var(--s));
    background:
      linear-gradient(115deg, #fff0 0%, #fff0 18%, rgba(255, 255, 255, 0.07) 30%, rgba(255, 255, 255, 0.02) 42%, #fff0 50%),
      rgba(0, 0, 0, 0.6);
    box-shadow:
      inset 0 0 0 1px rgba(255, 255, 255, 0.08),
      inset 1px 1px 0 rgba(255, 255, 255, 0.07),
      inset -1px -1px 0 rgba(0, 0, 0, 0.3);
  }
  .n { opacity: .5; font-variant-numeric: tabular-nums; text-align: right; }
  .t { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .t small { display: block; font-size: .8em; opacity: .55; }
  .d { opacity: .5; font-variant-numeric: tabular-nums; }
  .current .n::before { content: '▶'; font-size: .7em; margin-right: .4em; }
</style>
