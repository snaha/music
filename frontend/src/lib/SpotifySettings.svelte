<script lang="ts">
  import LibrarySelect from './ui/library-select.svelte';
  import Button from './ui/button.svelte';
  import { connectSpotify, disconnectSpotify, refreshDevices, refreshSpotify, selectSpotifyDevice, spotify, removeSpotifyLibrary, spotifyMessage, checkSpotify } from './spotify.svelte';
  import { capture, enableCapture } from './spotify-visualizer.svelte';
  const albums = $derived(spotify.albums.length);
  const playlists = $derived(spotify.collections.filter((t) => t.kind === 'playlist' && t.id !== 'spotify:liked').length);
  const hasLiked = $derived(spotify.collections.some((t) => t.id === 'spotify:liked'));
  let clientId = $state('');
  let deviceId = $state('');
  let sameMac = $state(false);
  $effect(() => { if (!clientId) clientId = spotify.clientId; });
  $effect(() => { deviceId = spotify.deviceId; sameMac = spotify.sameMac; });
</script>

{#if window.spotify}
  <section class="spotify-settings">
    <h2>Spotify</h2>
    <p role="status">{spotifyMessage()}</p>
    {#if spotify.collections.length || spotify.albums.length}
      <Button variant="outline" onclick={removeSpotifyLibrary}>Remove saved Spotify library</Button>
    {/if}
    {#if !spotify.connected || spotify.availability === 'reconnect'}
      <p>Your albums, likes and playlists, played through Spotify Desktop.</p>
      <label>Client ID <input type="text" bind:value={clientId} placeholder="Spotify developer app client ID" autocomplete="off" spellcheck="false" /></label>
      <small>Register <code>http://127.0.0.1:8888/callback</code> in your Spotify developer app. No client secret is needed.</small>
      <div class="actions">
        <Button variant="outline" disabled={spotify.connecting || !clientId} onclick={() => connectSpotify(clientId)}>{spotify.connecting ? 'Waiting for Spotify…' : 'Connect Spotify'}</Button>
        {#if spotify.connecting}<Button variant="outline" onclick={() => window.spotify!.cancel()}>Cancel</Button>{/if}
      </div>
    {:else}
      <p>Connected · {spotify.account}</p>
      <Button variant="outline" onclick={() => checkSpotify(true)}>Check connection and output</Button>
      <div class="actions">
        <Button variant="outline" disabled={spotify.syncing || spotify.indexing} onclick={refreshSpotify}>{spotify.syncing || spotify.indexing ? 'Refreshing…' : 'Refresh library'}</Button>
        <Button variant="outline" onclick={disconnectSpotify}>Disconnect</Button>
      </div>
      <p>{albums} library albums · {spotify.indexedTracks} indexed tracks · {playlists} playlists{#if hasLiked}, and Liked Songs{/if}{#if spotify.updatedAt} · Updated {new Date(spotify.updatedAt).toLocaleString()}{/if}</p>
      <p>{spotify.inaccessiblePlaylists} playlists have inaccessible contents and cannot contribute album tracks.</p>
      {#if spotify.indexError}<p class="error">Album discovery paused: {spotify.indexError}</p>{/if}
      <h3>Spotify visualization · experimental</h3>
      <label><input type="checkbox" checked={capture.enabled} onchange={event => enableCapture(event.currentTarget.checked)} /><span>Enable Spotify audio capture for visualizations</span></label>
      <small>macOS 14.2+. Captures only Spotify on this Mac while a visualizer is open, including the background. Audio is never replayed, recorded or uploaded.</small>
      {#if capture.message}<p role="status">{capture.message}</p>{/if}
      <h3>Playback output</h3>
      <p>Open Spotify Desktop on this Mac, then select it below. Both players must use the same audio output.</p>
      <div class="actions">
        <LibrarySelect label="Spotify playback device" bind:value={deviceId} options={[{ value: '', label: 'Select a device' }, ...(spotify.deviceId && !spotify.devices.some(device => device.id === spotify.deviceId) ? [{ value: spotify.deviceId, label: spotify.deviceName }] : []), ...spotify.devices.filter(device => !device.is_restricted).map(device => ({ value: device.id, label: `${device.name} · ${device.type}` }))]} />
        <Button variant="outline" onclick={refreshDevices}>Find devices</Button>
      </div>
      <label><input type="checkbox" bind:checked={sameMac} /><span>This is Spotify Desktop on this Mac</span></label>
      <Button variant="outline" disabled={!deviceId} onclick={() => selectSpotifyDevice(deviceId, sameMac)}>Use this output</Button>
      <small>For managed queues, turn Autoplay off in Spotify. Music controls shuffle and repeat while its queue is playing. Remote speakers support Spotify-only queues.</small>
    {/if}
    {#if spotify.progress}<p role="status">{spotify.progress}</p>{/if}
    {#if spotify.error}<p class="error" role="alert">{spotify.error}</p>{/if}
  </section>
{/if}

<style>
  section { display: flex; flex-direction: column; gap: 14px; letter-spacing: 0; text-transform: none; max-width: 700px; }
  h2 { margin: 0; font-size: 18px; font-weight: 600; letter-spacing: -.015em; }
  h3 { margin: 18px 0 0; font-size: 15px; font-weight: 600; }
  p { margin: 0; line-height: 1.5; color: var(--ui-text-muted); }
  small { line-height: 1.6; font-size: 12px; color: var(--ui-text-muted); }
  code { overflow-wrap: anywhere; }
  label, .actions { display: flex; gap: 12px; flex-wrap: wrap; align-items: center; }
  label > span { flex: 1; min-width: 0; }
  input[type=checkbox] { flex-shrink: 0; }
  input[type=text] { flex: 1; min-width: 0; width: 100%; }
  input { font: inherit; color: var(--ui-text); background: var(--ui-muted); border: 1px solid var(--ui-border); border-radius: var(--ui-radius); padding: 10px 14px; }
  input[type=checkbox] { accent-color: var(--ui-accent); width: 18px; height: 18px; }
  .spotify-settings :global([data-slot=button]) { align-self: flex-start; }
  input:focus-visible { outline: 2px solid var(--ui-accent); outline-offset: 3px; }
  .error { color: #ffb8ad; opacity: 1; }
</style>
