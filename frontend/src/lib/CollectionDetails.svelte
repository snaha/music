<script lang="ts">
  import { untrack } from 'svelte';
  import { spotify, spotifyPlayable, spotifyMessage, spotifyRecoveryLabel, checkSpotify, refreshSpotify } from './spotify.svelte';
  import { spotifyCollectionState } from './spotify-collection-state';
  import Button from './ui/button.svelte';
  import Drawer from './Drawer.svelte';
  import { trackPages, pick, addCollection, type Tile } from './library.svelte';
  import { play, player } from './player.svelte';
  import type { Track } from './music';
  let { tile, onclose }: { tile: Tile; onclose: () => void } = $props();
  const access = $derived(spotifyCollectionState(tile, spotify.indexing));
  const requestKey = $derived(`${tile.id}:${tile.available}:${tile.indexing}:${tile.count}:${tile.incomplete}`);
  let loadedId = '';
  let tracks = $state<Track[]>([]), loading = $state(true), error = $state('');
  $effect(() => {
    requestKey;
    const selected = untrack(() => tile); let canceled = false;
    if (selected.id !== loadedId) tracks = [];
    loadedId = selected.id; loading = true; error = '';
    if (spotifyCollectionState(selected, untrack(() => spotify.indexing))) { loading = false; return; }
    void (async () => {
      try { let nextTracks: Track[] = []; for await (const page of trackPages(selected)) { if (canceled) return; nextTracks = [...nextTracks, ...page]; tracks = nextTracks; } }
      catch (e) { if (!canceled) error = (e as Error).message; }
      finally { if (!canceled) loading = false; }
    })();
    return () => { canceled = true; };
  });
  function recover() { if (spotify.availability === 'offline' || spotify.availability === 'checking') void checkSpotify(true); else { onclose(); player.view = 'settings'; } }
  function listen(index = 0) { if (tile.source === 'spotify' && !spotifyPlayable()) { recover(); return; } play((loading ? [tracks[index]] : tracks).map(track => ({ ...track, playbackOrigin: tile })), loading ? 0 : index); onclose(); }
</script>
<Drawer {onclose}>
  <section>
    {#if tile.source === 'spotify' && !spotifyPlayable()}<p role="status">{spotifyMessage()}</p><Button onclick={recover}>{spotifyRecoveryLabel()}</Button>{/if}
    {#if tile.source === 'spotify' && tile.available && tile.incomplete}<p>{spotify.connected ? 'Some songs have not loaded yet. Refresh your Spotify library in Settings to retry.' : 'Reconnect Spotify to load the remaining songs.'}</p>{/if}
    <header><h2>{tile.title}</h2><p>{tile.sub}{#if !access} · {tracks.length} included track{tracks.length === 1 ? '' : 's'}{loading ? ' · Loading…' : ''}{/if}</p>
      {#if access}<div class="availability-help"><p>{access.detail}</p><p>{access.help}</p></div>{/if}
      {#if tracks.some(track => track.available)}
      <Button disabled={!tracks.length} onclick={() => { if (tile.source === 'spotify' && !spotifyPlayable()) recover(); else { void pick(tile); onclose(); } }}>Play included tracks</Button>
      <Button disabled={!tracks.length} onclick={() => { void addCollection(tile); onclose(); }}>{tile.source === 'spotify' && !spotifyPlayable() ? 'Add to queue · Spotify required' : 'Add to queue'}</Button>
      {/if}
      {#if access?.refresh}<Button disabled={!spotify.connected || spotify.syncing || spotify.indexing} onclick={refreshSpotify}>{spotify.syncing || spotify.indexing ? 'Refreshing library…' : 'Refresh Spotify library'}</Button>{/if}
      {#if tile.source === 'spotify' && tile.externalUrl}<Button onclick={() => window.spotify?.external(tile.externalUrl!).catch(e => (player.error = e.message))}>Open in Spotify ↗</Button>{/if}
    </header>
    {#if error}<p role="alert">{error}</p>{/if}
    {#each tracks as track, i (`${i}:${track.id}`)}
      <button class="track" disabled={!track.available} onclick={() => listen(i)}>
        <span>{tile.kind === 'album' ? `${track.disc ?? 1}.${track.track ?? i + 1}` : i + 1}</span>
        <span>{track.title}<small>{track.artist}</small><small>{track.origins?.map(origin => origin.kind === 'album' ? 'Saved album' : origin.title).join(' · ') ?? (tile.source === 'local' ? 'Local library' : tile.title)}</small></span>
        <span>{Math.floor((track.duration ?? 0) / 60)}:{String(Math.floor((track.duration ?? 0) % 60)).padStart(2, '0')}</span>
      </button>
    {/each}
  </section>
</Drawer>
<style>
  section { padding: 16px 28px 32px; overflow: auto; font: 16px/1.5 system-ui; }
  h2 { margin: 0; } p { color: #aaa; }
  header { padding-bottom: 18px; display: flex; flex-wrap: wrap; align-items: flex-start; gap: 8px; }
  header h2, header p { width: 100%; overflow-wrap: anywhere; }
  button { font: inherit; color: #eee; background: #252529; border: 1px solid #ffffff30; border-radius: 6px; padding: 8px 12px; cursor: pointer; margin: 0 8px 8px 0; }
  button:disabled { opacity: .4; cursor: default; }
  .track { display: grid; grid-template-columns: 35px minmax(0, 1fr) auto; box-sizing: border-box; overflow-wrap: anywhere; gap: 14px; width: 100%; margin-right: 0; text-align: left; background: #1119; }
  .availability-help { flex-basis: 100%; width: 100%; }
  .availability-help p { max-width: 65ch; margin: 0 0 12px; color: var(--ui-text, #eee); }
  .availability-help p + p { color: var(--ui-text-muted, #bbb); }
  small { display: block; color: #aaa; font-size: 12px; }
</style>
