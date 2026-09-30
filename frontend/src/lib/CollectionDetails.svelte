<script lang="ts">
  import Drawer from './Drawer.svelte';
  import { trackPages, pick, addCollection, type Tile } from './library.svelte';
  import { play, player } from './player.svelte';
  import type { Track } from './music';
  let { tile, onclose }: { tile: Tile; onclose: () => void } = $props();
  let tracks = $state<Track[]>([]), loading = $state(true), error = $state('');
  $effect(() => {
    const selected = tile; let canceled = false; tracks = []; loading = true; error = '';
    void (async () => {
      try { for await (const page of trackPages(selected)) { if (canceled) return; tracks = [...tracks, ...page]; } }
      catch (e) { if (!canceled) error = (e as Error).message; }
      finally { if (!canceled) loading = false; }
    })();
    return () => { canceled = true; };
  });
  function listen(index = 0) { play(loading ? [tracks[index]] : tracks, loading ? 0 : index); onclose(); }
</script>
<Drawer {onclose}>
  <section>
    <header><h2>{tile.title}</h2><p>{tile.sub} · {tracks.length} included track{tracks.length === 1 ? '' : 's'}{loading ? ' · Loading…' : ''}</p>
      <button disabled={!tracks.length} onclick={() => { void pick(tile); onclose(); }}>Play included tracks</button>
      <button disabled={!tracks.length} onclick={() => { void addCollection(tile); onclose(); }}>Add to queue</button>
      {#if tile.source === 'spotify' && tile.externalUrl}<button onclick={() => window.spotify?.external(tile.externalUrl!).catch(e => (player.error = e.message))}>Open in Spotify ↗</button>{/if}
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
  header { padding-bottom: 18px; }
  button { font: inherit; color: #eee; background: #252529; border: 1px solid #ffffff30; border-radius: 6px; padding: 8px 12px; cursor: pointer; margin: 0 8px 8px 0; }
  button:disabled { opacity: .4; cursor: default; }
  .track { display: grid; grid-template-columns: 45px 1fr auto; gap: 14px; width: 100%; text-align: left; background: #1119; }
  small { display: block; color: #aaa; font-size: 12px; }
</style>
