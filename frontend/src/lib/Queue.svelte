<script lang="ts">
  import { keyboardScope } from './keyboard';
  import { onMount } from 'svelte';
  import { fly } from 'svelte/transition';
  import { jump, moveQueue, removeQueue, replayHistory, player } from './player.svelte';
  import { listeningHistory, loadHistory, clearHistory, historyTrack, searchHistory, retryHistory } from './listening-history.svelte';
  let historyQuery = $state('');
  let searchTimer: ReturnType<typeof setTimeout> | undefined;
  onMount(() => () => clearTimeout(searchTimer));
  const recent = $derived(listeningHistory.entries);
  const playedAt = (time: number) => new Date(time).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  let { onclose, palette }: { onclose: () => void; palette: string } = $props();
  let closeButton: HTMLButtonElement;
  const fmt = (s = 0) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  function close() { onclose(); player.topHidden = true; }
  onMount(() => {
    loadHistory();
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
    <span class="count">{player.queueTab === 'history' ? listeningHistory.total : player.queue.length} tracks</span>
  </header>
  <div class="content">
    <div class="artwork">
      {#if player.song}
        {#key player.song.cover}
          <img src={player.song.cover} alt="{player.song.album || player.song.title} cover" />
        {/key}
        <div class="album-meta"><h1>{player.song.album || player.song.title}</h1><p>{player.song.artist}</p>{#if player.song.playbackOrigin}<p class="origin">From {player.song.playbackOrigin.title}</p>{/if}</div>
      {:else}
        <div class="empty-art"><svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true"><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="2" /></svg></div>
        <div class="album-meta"><h1>Your queue</h1><p>Choose a track to start listening.</p></div>
      {/if}
    </div>
    <div class="list" aria-label={player.queueTab === 'history' ? 'Recently played tracks' : 'Queued tracks'}>
      <div class="list-tabs" role="tablist" tabindex="-1" aria-label="Player views" onkeydown={event => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault(); event.stopPropagation();
        player.queueTab = event.key === 'Home' ? 'queue' : event.key === 'End' ? 'history' : player.queueTab === 'queue' ? 'history' : 'queue';
        requestAnimationFrame(() => document.getElementById(`player-tab-${player.queueTab}`)?.focus());
      }}>
        <button id="player-tab-queue" role="tab" aria-selected={player.queueTab === 'queue'} aria-controls="player-track-list" tabindex={player.queueTab === 'queue' ? 0 : -1} onclick={() => (player.queueTab = 'queue')}>Queue</button>
        <button id="player-tab-history" role="tab" aria-selected={player.queueTab === 'history'} aria-controls="player-track-list" tabindex={player.queueTab === 'history' ? 0 : -1} onclick={() => (player.queueTab = 'history')}>Recently played</button>
      </div>
      <div id="player-track-list" aria-busy={player.queueTab === 'history' && listeningHistory.loading} role="tabpanel" aria-labelledby={`player-tab-${player.queueTab}`}>
      {#if player.queueTab === 'history'}
        <div class="history-heading"><h2>Recently played <span>· {listeningHistory.total}</span></h2><span class="history-loading" role="status">{listeningHistory.loading ? 'Loading…' : ''}</span>{#if recent.length}<button class="clear-history" onclick={clearHistory}>Clear history</button>{/if}</div>
        {#if window.musicHistory}
          <input class="history-search" type="search" aria-label="Search listening history" placeholder="Search songs, artists, albums or playlists" bind:value={historyQuery} oninput={() => { clearTimeout(searchTimer); searchTimer = setTimeout(() => void searchHistory(historyQuery), 180); }} />
        {/if}
        {#if listeningHistory.error}<p role="status" class="empty">{listeningHistory.error} <button class="clear-history" onclick={retryHistory}>Retry</button></p>{/if}
        {#if !recent.length && !listeningHistory.loading}<p class="empty">{historyQuery ? 'No plays match your search.' : 'Songs you play will appear here with the album or playlist they came from.'}</p>{/if}
        {#each recent as entry (entry.id)}
          {@const song = historyTrack(entry.context.queue[entry.index])}
          {@const origin = song.playbackOrigin || entry.context.origin}
          <div class="song">
            <button class="select-song recent-song" onclick={() => replayHistory(entry)} disabled={!song.available} aria-label="Play {song.title} from {origin?.title || song.album || 'your queue'}">
              {#if song.cover}<img class="history-cover" src={song.cover} alt="" loading="lazy" />{:else}<span class="history-cover placeholder" aria-hidden="true"></span>{/if}
              <span class="t">{song.title}<small>{song.artist}</small><small>{origin ? `${origin.kind === 'playlist' ? 'Playlist' : origin.kind === 'album' ? 'Album' : 'Artist'} · ${origin.title}` : song.album || 'Queue'} · {song.source}{song.available ? '' : ' · unavailable'}</small></span>
              <time datetime={new Date(entry.playedAt).toISOString()}>{playedAt(entry.playedAt)}</time>
            </button>
          </div>
        {/each}
        {#if listeningHistory.hasMore}<button class="clear-history" disabled={listeningHistory.loading} onclick={() => void searchHistory(historyQuery, true)}>Load older plays</button>{/if}
      {:else}
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
      {/if}
      </div>
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
  .content { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: clamp(32px, 5vw, 80px); padding: clamp(24px, 4vw, 64px); min-height: 0; flex: 1; max-width: 2200px; width: 100%; box-sizing: border-box; align-self: center; }
  .artwork { min-height: 0; display: flex; flex-direction: column; align-items: flex-start; gap: 20px; overflow-y: auto; scrollbar-width: thin; scrollbar-color: var(--play-line) transparent; }
  .artwork img, .empty-art { width: 100%; max-height: none; aspect-ratio: 1; object-fit: contain; object-position: left center; display: block; }
  .artwork img, .empty-art { flex: 1; min-height: 0; }
  .album-meta { flex-shrink: 0; }
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
  .list-tabs { display: flex; gap: 4px; margin-bottom: 24px; border-bottom: 1px solid var(--play-line); }
  .list-tabs button { padding: 10px 12px; min-height: 44px; border: 0; background: transparent; color: var(--play-muted); border-bottom: 2px solid transparent; }
  .list-tabs button[aria-selected=true] { color: var(--play-text); border-bottom-color: var(--play-accent); }
  .list-tabs button:hover, .clear-history:hover { background: var(--play-line); }
  .history-search { width: 100%; box-sizing: border-box; min-height: 44px; margin-bottom: 16px; padding: 10px 12px; font: inherit; color: var(--play-text); background: var(--play-bar); border: 1px solid var(--play-line); border-radius: 4px; }
  .history-search:focus-visible { outline: 2px solid var(--play-accent); outline-offset: 2px; }
  .history-loading { color: var(--play-muted); font-size: 11px; min-width: 48px; }
  .history-heading { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; }
  .clear-history { border: 0; background: transparent; color: var(--play-muted); font-size: 12px; min-height: 44px; padding: 8px; }
  .recent-song { grid-template-columns: 44px minmax(0, 1fr) auto; }
  .history-cover { width: 44px; height: 44px; object-fit: cover; border-radius: 3px; }
  .placeholder { background: var(--play-line); }
  time { color: var(--play-muted); font-size: 11px; max-width: 80px; text-align: right; }
  .select-song:disabled { opacity: .5; cursor: default; }
  .album-meta .origin { margin-top: 12px; font-size: 13px; }
  .empty { color: var(--play-muted); }
  ::selection { color: var(--play-bar); background: var(--play-accent); }
  @media (max-width: 700px) {
    header { padding: 0 12px; min-height: 48px; }
    .content { display: block; padding: 20px 16px; overflow-y: auto; scrollbar-width: thin; scrollbar-color: var(--play-line) transparent; }
    .artwork { overflow: visible; align-items: center; gap: 16px; }
    .artwork img, .empty-art { width: min(100%, 280px); max-height: none; flex: none; }
    .album-meta { width: 100%; margin-bottom: 28px; }
    .album-meta p { font-size: 14px; }
    .list { overflow: visible; padding: 0; }
    .recent-song { grid-template-columns: 36px minmax(0, 1fr) auto; }
    .history-cover { width: 36px; height: 36px; }
    .select-song:not(.recent-song) { grid-template-columns: 20px minmax(0, 1fr) auto; gap: 8px; }
  }
  @media (prefers-reduced-motion: reduce) { .now-playing { transition: none; } }
</style>
