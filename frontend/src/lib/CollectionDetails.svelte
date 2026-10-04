<script lang="ts">
  import { onMount, tick, untrack } from 'svelte';
  import { keyboardScope } from './keyboard';
  import { trackPages, pick, addCollection, type Tile } from './library.svelte';
  import { collectionTrackIsCurrent, play, player, toggle, enqueue } from './player.svelte';
  import { artworkPalette, fallbackPalette } from './artwork-palette';
  import { metadata, saveMetadata } from './discovery.svelte';
  import CollectionPlayback from './CollectionPlayback.svelte';
  import AlbumTraits from './AlbumTraits.svelte';
  import Icon from './ui/icon.svelte';
  import ArtworkView from './ArtworkView.svelte';
  import type { Track } from './music';
  let { tile, onclose }: { tile: Tile; onclose: () => void } = $props();
  const info = $derived(metadata(tile));
  const requestKey = $derived(`${tile.id}:${tile.available}:${tile.indexing}:${tile.count}:${tile.incomplete}`);
  let loadedId = '', back: HTMLButtonElement;
  let tracks = $state<Track[]>([]), loading = $state(true), error = $state(''), query = $state(''), actions = $state(false), preferences = $state(false), palette = $state(fallbackPalette);
  const shown = $derived(tracks.map((track, index) => ({ track, index })).filter(({ track }) => `${track.title} ${track.artist ?? ''}`.toLocaleLowerCase().includes(query.toLocaleLowerCase())));
  onMount(() => { const previous = document.activeElement as HTMLElement | null; back.focus({ preventScroll: true }); return () => { if (previous?.isConnected && (document.activeElement === document.body || document.activeElement?.closest('.album-view'))) previous.focus({ preventScroll: true }); }; });
  $effect(() => { const cover = tile.cover; let active = true; void artworkPalette(cover).then(value => { if (active) palette = value; }); return () => { active = false; }; });
  $effect(() => {
    requestKey;
    const selected = untrack(() => tile); let canceled = false;
    if (selected.id !== loadedId) tracks = [];
    loadedId = selected.id; loading = true; error = '';
    void (async () => {
      try { let nextTracks: Track[] = []; for await (const page of trackPages(selected)) { if (canceled) return; nextTracks = [...nextTracks, ...page]; tracks = nextTracks; } }
      catch (e) { if (!canceled) error = (e as Error).message; }
      finally { if (!canceled) loading = false; }
    })();
    return () => { canceled = true; };
  });
  function listen(index: number) {
    const track = tracks[index]; if (!track?.available) return;
    if (collectionTrackIsCurrent(tile, tracks, index)) { void toggle(); return; }
    play(tracks.map(track => ({ ...track, playbackOrigin: tile })), index);
  }
  async function toggleActions() { actions = !actions; if (actions) { await tick(); document.querySelector<HTMLButtonElement>('#album-actions button')?.focus(); } }
  function actionKeys(event: KeyboardEvent) { if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return; event.preventDefault(); event.stopPropagation(); const items = [...document.querySelectorAll<HTMLButtonElement>('#album-actions button:not(:disabled)')]; const index = items.indexOf(document.activeElement as HTMLButtonElement); items[event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus(); }
  function keys(event: KeyboardEvent) { if (event.key !== 'Escape' || event.defaultPrevented) return; event.preventDefault(); event.stopPropagation(); if (preferences) preferences = false; else if (actions) { actions = false; document.querySelector<HTMLButtonElement>('[aria-label="Album menu"]')?.focus(); } else if (query) query = ''; else onclose(); }
  const fmt = (s = 0) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
</script>
<ArtworkView className="album-view" {palette} label={`${tile.title} details`} onkeydown={keys}>
  {#snippet header()}
    <button class="detail-icon" bind:this={back} onclick={onclose} aria-label="Back to music"><Icon name="back" /></button>
    <div class="detail-heading"><h1>{tile.title}</h1><p>{tile.sub}{#if info.year} <span>{' · '}{info.year}</span>{/if}</p></div>
    <label class="track-search"><Icon name="search" /><input aria-label="Search album tracks" placeholder="Search tracks" bind:value={query} /></label>
    <div class="actions">
      <button class="detail-icon" aria-label="Album menu" aria-expanded={actions} aria-controls="album-actions" aria-haspopup="menu" onclick={toggleActions}><Icon name="more" /></button>
      {#if actions}<div class="action-menu" id="album-actions" role="menu" aria-label="Album actions" use:keyboardScope={actionKeys}>
        <button role="menuitem" onclick={() => { saveMetadata(tile.id, { favorite: !info.favorite }); }}>{info.favorite ? 'Remove from favorites' : 'Add to favorites'}</button>
        <button role="menuitem" disabled={!tracks.some(track => track.available)} onclick={() => { void addCollection(tile); actions = false; }}>Add to queue</button>
        <button role="menuitem" onclick={() => { preferences = !preferences; actions = false; }}>Album preferences & Dig tags</button>
      </div>{/if}
    </div>
  {/snippet}
  {#snippet artwork()}
      {#if tile.cover}<img class="detail-cover" src={tile.cover} alt="{tile.title} cover" />{:else}<div class="no-art detail-cover">{tile.title}</div>{/if}
      <div class="album-controls">{#if loading || tracks.some(track => track.available)}<CollectionPlayback collection={tile} onplay={() => { void pick(tile); }} />{/if}<button class="favorite icon" class:selected={info.favorite} aria-pressed={info.favorite} aria-label={info.favorite ? 'Remove from favorites' : 'Add to favorites'} onclick={() => saveMetadata(tile.id, { favorite: !info.favorite })}><svg viewBox="0 0 24 24" width="20" height="20" fill={info.favorite ? 'currentColor' : 'none'} stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="m12 3 2.8 5.7 6.3.9-4.5 4.4 1 6.2-5.6-2.9-5.6 2.9 1-6.2L2 9.6l6.2-.9Z" /></svg></button></div>
      <p class="album-meta">{info.genres.join(' · ') || 'Local library'}{#if tracks.length}{' · '}{tracks.length} tracks{/if}{#if loading}{' · '}Loading…{/if}</p>
      {#if preferences}<AlbumTraits {tile} />{/if}
  {/snippet}
  <div class="track-list">
      {#if error}<p class="notice" role="alert">{error}</p>{/if}
      {#if loading && !tracks.length}<p class="notice" role="status">Loading tracks…</p>{/if}
      {#each shown as { track, index } (`${index}:${track.id}`)}
        {@const current = collectionTrackIsCurrent(tile, tracks, index)}
        <div class="track-row" class:current>
          <button class="track" disabled={!track.available} aria-label="{current && player.playing ? 'Pause' : 'Play'} {track.title}" onclick={() => listen(index)}>
            <span class="number">{#if current && player.playing}<Icon name="listening" />{:else}{index + 1}{/if}</span>
            <span class="track-name">{track.title}<small>{track.artist}{#if !track.available} · Unavailable{/if}</small></span><span class="duration">{fmt(track.duration)}</span>
          </button>
          <button class="track-add icon" disabled={!track.available} aria-label="Add {track.title} to queue" title="Add to queue" onclick={() => enqueue([{ ...track, playbackOrigin: tile }])}><Icon name="plus" /></button>
        </div>
      {/each}
      {#if !shown.length && !loading && !error}<p class="notice">{query ? 'No tracks match your search.' : 'No music tracks in this collection.'}</p>{/if}
    </div>
</ArtworkView>
<style>


  button { font: inherit; color: inherit; cursor: pointer; } .icon { display: grid; place-items: center; width: 40px; min-height: 40px; flex-shrink: 0; border: 0; background: transparent; border-radius: 4px; }
  button:hover { background: var(--play-line); } button:focus-visible, input:focus-visible { outline: 2px solid var(--play-accent); outline-offset: 2px; } button:disabled { opacity: .4; cursor: default; }
  .detail-heading span { white-space: nowrap; }
  .track-search { display: flex; gap: 8px; align-items: center; width: 220px; border-bottom: 1px solid var(--play-line); padding: 6px 0; color: var(--play-muted); } input { background: transparent; border: 0; color: var(--play-text); font: inherit; width: 100%; min-width: 0; } input::placeholder { color: var(--play-muted); }
  .actions { position: relative; } .action-menu { position: absolute; right: 0; top: 44px; width: 255px; z-index: 1; background: var(--play-bar); padding: 6px; border: 1px solid var(--play-line); box-shadow: 0 10px 25px #0004; border-radius: 4px; } .action-menu button { display: block; width: 100%; min-height: 40px; padding: 8px 12px; border: 0; background: transparent; text-align: left; }
  .no-art { display: grid; place-items: center; background: var(--play-bar); padding: 24px; box-sizing: border-box; } .album-controls { display: flex; align-items: center; justify-content: center; gap: 12px; margin-top: 20px; flex-shrink: 0; } .album-meta { color: var(--play-muted); font-size: 12px; text-align: center; flex-shrink: 0; }
  .track-row { display: flex; align-items: center; border-bottom: 1px solid var(--play-line); } .track { flex: 1; min-width: 0; display: grid; grid-template-columns: 28px minmax(0, 1fr) auto; align-items: center; width: 100%; min-height: 60px; border: 0; background: transparent; padding: 10px 12px; gap: 12px; text-align: left; } .track-add { opacity: 0; } .track-row:hover .track-add, .track-row:focus-within .track-add { opacity: 1; } .number { color: var(--play-muted); font-variant-numeric: tabular-nums; display: grid; place-items: center; } .track-name { overflow-wrap: anywhere; } small { display: block; color: var(--play-muted); font-size: 12px; margin-top: 3px; } .duration { color: var(--play-muted); font-size: 12px; font-variant-numeric: tabular-nums; } .current { background: var(--play-line); } .current .track-add { opacity: 0; } .track-row:hover .track-add, .track-row:focus-within .track-add { opacity: 1; } .number { color: var(--play-accent); }
  .notice { color: var(--play-muted); margin: 0 0 20px; line-height: 1.6; }
  @media (max-width: 700px) { .track-search { order: 4; width: 100%; margin: 0 8px; } .icon, .action-menu button { min-height: 44px; min-width: 44px; } .track-add { opacity: 1; } .track { padding: 10px 4px; gap: 8px; } }
</style>
