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
      <details open={!spotify.deviceId || spotify.availability === 'device-unavailable'}>
        <summary><span>Playback output</span><span class="device">{spotify.deviceName}</span></summary>
        <div class="detail-body">
          <p>Open Spotify Desktop on this Mac, then select it below. Both players must use the same audio output.</p>
          <div class="actions">
            <LibrarySelect label="Spotify playback device" bind:value={deviceId} options={[{ value: '', label: 'Select a device' }, ...(spotify.deviceId && !spotify.devices.some(device => device.id === spotify.deviceId) ? [{ value: spotify.deviceId, label: spotify.deviceName }] : []), ...spotify.devices.filter(device => !device.is_restricted).map(device => ({ value: device.id, label: `${device.name} · ${device.type}` }))]} />
            <Button variant="outline" onclick={refreshDevices}>Find devices</Button>
          </div>
          <label><input type="checkbox" bind:checked={sameMac} /><span>This is Spotify Desktop on this Mac</span></label>
          <Button variant="outline" disabled={!deviceId} onclick={() => selectSpotifyDevice(deviceId, sameMac)}>Use this output</Button>
          <small>For managed queues, turn Autoplay off in Spotify. Music controls shuffle and repeat while its queue is playing. Remote speakers support Spotify-only queues.</small>
        </div>
      </details>
      <details>
        <summary>Library &amp; connection</summary>
        <div class="detail-body">
          <Button variant="outline" onclick={() => checkSpotify(true)}>Check connection and output</Button>
          <div class="actions">
            <Button variant="outline" disabled={spotify.syncing || spotify.indexing} onclick={refreshSpotify}>{spotify.syncing || spotify.indexing ? 'Refreshing…' : 'Refresh library'}</Button>
            <Button variant="outline" onclick={disconnectSpotify}>Disconnect</Button>
          </div>
          <p>{albums} library albums · {spotify.indexedTracks} indexed tracks · {playlists} playlists{#if hasLiked}, and Liked Songs{/if}{#if spotify.updatedAt} · Updated {new Date(spotify.updatedAt).toLocaleString()}{/if}</p>
          <p>{spotify.inaccessiblePlaylists} playlists have inaccessible contents and cannot contribute album tracks.</p>
          {#if spotify.collections.length || spotify.albums.length}
            <Button variant="outline" onclick={removeSpotifyLibrary}>Remove saved Spotify library</Button>
          {/if}
        </div>
      </details>
      <details>
        <summary>Visualization · experimental</summary>
        <div class="detail-body">
          <label><input type="checkbox" checked={capture.enabled} onchange={event => enableCapture(event.currentTarget.checked)} /><span>Enable Spotify audio capture for visualizations</span></label>
          <small>macOS 14.2+. Captures only Spotify on this Mac while a visualizer is open, including the background. Audio is never replayed, recorded or uploaded.</small>
        </div>
      </details>
    {/if}
    {#if (!spotify.connected || spotify.availability === 'reconnect') && (spotify.collections.length || spotify.albums.length)}
      <details>
        <summary>Saved library</summary>
        <div class="detail-body">
          <Button variant="outline" onclick={removeSpotifyLibrary}>Remove saved Spotify library</Button>
        </div>
      </details>
    {/if}
    {#if spotify.progress}<p role="status">{spotify.progress}</p>{/if}
    {#if spotify.indexError}<p class="error" role="status">Album discovery paused: {spotify.indexError}</p>{/if}
    {#if capture.message}<p role="status">{capture.message}</p>{/if}
    {#if spotify.error}<p class="error" role="alert">{spotify.error}</p>{/if}
  </section>
{/if}

<style>
  section { display: flex; flex-direction: column; gap: 12px; letter-spacing: 0; text-transform: none; max-width: 700px; border-top: 1px solid var(--ui-border); padding-top: 20px; }
  h2 { margin: 0; font-size: 16px; font-weight: 600; letter-spacing: -.015em; }
  p { margin: 0; line-height: 1.5; color: var(--ui-text-muted); }
  small { line-height: 1.6; font-size: 13px; color: var(--ui-text-muted); }
  code { overflow-wrap: anywhere; }
  label, .actions { display: flex; gap: 12px; flex-wrap: wrap; align-items: center; }
  label { min-height: 44px; cursor: pointer; }
  label > span { flex: 1; min-width: 0; }
  input[type=checkbox] { flex-shrink: 0; }
  input[type=text] { flex: 1; min-width: 0; width: 100%; }
  input[type=text] { font: inherit; color: var(--ui-text); background: var(--ui-muted); border: 1px solid var(--ui-border); border-radius: var(--ui-radius); padding: 10px 14px; caret-color: var(--ui-accent); }
  input[type=text]::placeholder { color: var(--ui-text-muted); opacity: 1; }
  input[type=checkbox] { margin: 0; accent-color: var(--ui-accent); width: 18px; height: 18px; }
  .spotify-settings :global([data-slot=button]) { align-self: flex-start; }
  input:focus-visible { outline: 2px solid var(--ui-accent); outline-offset: 3px; }
  details { border-top: 1px solid var(--ui-border); }
  summary { min-height: 44px; display: flex; align-items: center; justify-content: space-between; gap: 12px; font-weight: 550; color: var(--ui-text-muted); cursor: pointer; list-style: none; }
  summary::-webkit-details-marker { display: none; }
  summary::after { content: ""; width: 7px; height: 7px; border-right: 1.5px solid currentColor; border-bottom: 1.5px solid currentColor; transform: rotate(45deg); transition: transform 180ms ease-out; margin-right: 4px; }
  details[open] > summary::after { transform: rotate(225deg); }
  summary:hover, details[open] > summary { color: var(--ui-text); }
  summary:focus-visible { outline: 2px solid var(--ui-accent); outline-offset: 3px; border-radius: var(--ui-radius); }
  .device { margin-left: auto; max-width: 50%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 400; font-size: 13px; }
  .detail-body { display: flex; flex-direction: column; gap: 12px; padding: 8px 0 16px; }
  @media (prefers-reduced-motion: reduce) { summary::after { transition: none; } }
  @media (max-width: 700px) { .spotify-settings :global([data-slot=button]), .spotify-settings :global(.library-select-field input), .spotify-settings :global(.library-select-field button) { min-height: 44px; } .spotify-settings :global(.library-select-field button) { flex-basis: 44px; } }
  .error { color: #ffb8ad; opacity: 1; }
</style>
