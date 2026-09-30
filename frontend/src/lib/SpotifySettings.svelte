<script lang="ts">
  import { connectSpotify, disconnectSpotify, refreshDevices, refreshSpotify, selectSpotifyDevice, spotify } from './spotify.svelte';
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
    {#if !spotify.connected}
      <p>Your albums, likes and playlists, played through Spotify Desktop.</p>
      <label>Client ID <input type="text" bind:value={clientId} placeholder="Spotify developer app client ID" autocomplete="off" spellcheck="false" /></label>
      <small>Register <code>http://127.0.0.1:8888/callback</code> in your Spotify developer app. No client secret is needed.</small>
      <div class="actions">
        <button disabled={spotify.connecting || !clientId} onclick={() => connectSpotify(clientId)}>{spotify.connecting ? 'Waiting for Spotify…' : 'Connect Spotify'}</button>
        {#if spotify.connecting}<button onclick={() => window.spotify!.cancel()}>Cancel</button>{/if}
      </div>
    {:else}
      <p>Connected · {spotify.account}</p>
      <div class="actions">
        <button disabled={spotify.syncing || spotify.indexing} onclick={refreshSpotify}>{spotify.syncing || spotify.indexing ? 'Refreshing…' : 'Refresh library'}</button>
        <button onclick={disconnectSpotify}>Disconnect</button>
      </div>
      <p>{albums} library albums · {spotify.indexedTracks} indexed tracks · {playlists} playlists{#if hasLiked}, and Liked Songs{/if}{#if spotify.updatedAt} · Updated {new Date(spotify.updatedAt).toLocaleString()}{/if}</p>
      <p>{spotify.inaccessiblePlaylists} playlists have inaccessible contents and cannot contribute album tracks.</p>
      {#if spotify.indexError}<p class="error">Album discovery paused: {spotify.indexError}</p>{/if}
      <h3>Spotify visualization · experimental</h3>
      <label><input type="checkbox" checked={capture.enabled} onchange={event => enableCapture(event.currentTarget.checked)} /> Enable Spotify audio capture for visualizations</label>
      <small>macOS 14.2+. Captures only Spotify on this Mac while a visualizer is open, including the background. Audio is never replayed, recorded or uploaded.</small>
      {#if capture.message}<p role="status">{capture.message}</p>{/if}
      <h3>Playback output</h3>
      <p>Open Spotify Desktop on this Mac, then select it below. Both players must use the same audio output.</p>
      <div class="actions">
        <select aria-label="Spotify playback device" bind:value={deviceId}>
          <option value="">Select a device</option>
          {#if spotify.deviceId && !spotify.devices.some((d) => d.id === spotify.deviceId)}<option value={spotify.deviceId}>{spotify.deviceName}</option>{/if}
          {#each spotify.devices as device (device.id)}<option value={device.id} disabled={device.is_restricted}>{device.name} · {device.type}</option>{/each}
        </select>
        <button onclick={refreshDevices}>Find devices</button>
      </div>
      <label><input type="checkbox" bind:checked={sameMac} /> This is Spotify Desktop on this Mac</label>
      <button disabled={!deviceId} onclick={() => selectSpotifyDevice(deviceId, sameMac)}>Use this output</button>
      <small>For managed queues, turn Autoplay off in Spotify. Music controls shuffle and repeat while its queue is playing. Remote speakers support Spotify-only queues.</small>
    {/if}
    {#if spotify.progress}<p role="status">{spotify.progress}</p>{/if}
    {#if spotify.error}<p class="error" role="alert">{spotify.error}</p>{/if}
  </section>
{/if}

<style>
  section { display: flex; flex-direction: column; gap: 14px; letter-spacing: 0; text-transform: none; max-width: 700px; }
  h2 { margin: 0; font-size: 1em; text-transform: uppercase; letter-spacing: .08em; }
  h3 { margin: 16px 0 0; font-size: .9em; }
  p { margin: 0; line-height: 1.5; opacity: .8; }
  small { line-height: 1.6; opacity: .6; }
  code { overflow-wrap: anywhere; }
  label, .actions { display: flex; gap: 12px; flex-wrap: wrap; align-items: center; }
  input[type=text] { flex: 1; min-width: 220px; }
  input, select, button { font: inherit; color: #eee; background: #222; border: 1px solid #666; border-radius: 4px; padding: 10px 14px; }
  input[type=checkbox] { accent-color: #1db954; width: 18px; height: 18px; }
  button { cursor: pointer; align-self: flex-start; }
  button:hover { background: #333; }
  button:disabled { opacity: .4; cursor: default; }
  .error { color: #ffb8ad; opacity: 1; }
</style>
