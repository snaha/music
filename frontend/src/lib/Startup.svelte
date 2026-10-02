<script lang="ts">
  import { onMount } from 'svelte';
  import Button from './ui/button.svelte';
  import SpotifySettings from './SpotifySettings.svelte';
  import { desktop } from './desktop.svelte';
  import { spotify } from './spotify.svelte';

  let { onretry }: { onretry: () => void } = $props();
  let busy = $state('');
  let error = $state('');
  let profiles = $state<ProfileEntry[]>([]);
  let selectedProfile = $state('');
  const status = $derived(desktop.status);
  const starting = $derived(status?.phase === 'starting');
  const connectingSpotify = $derived(status?.phase === 'ready' && status.onboarding && status.source === 'spotify');
  const problem = $derived(error || desktop.error || status?.error || '');

  onMount(() => {
    window.desktop?.profiles().then(items => { profiles = items.filter(item => item.setupComplete && item.name !== status?.profile.name); selectedProfile = profiles[0]?.name || ''; }).catch(() => {});
  });
  async function chooseFolder() {
    busy = 'folder'; error = '';
    try {
      const musicFolder = await window.desktop!.chooseFolder();
      if (musicFolder) desktop.status = await window.desktop!.start({ source: 'folder', musicFolder });
    } catch (failure) { error = (failure as Error).message; }
    finally { busy = ''; }
  }
  async function start(source: 'spotify' | 'empty') {
    busy = source; error = '';
    try { desktop.status = await window.desktop!.start({ source }); }
    catch (failure) { error = (failure as Error).message; }
    finally { busy = ''; }
  }
  async function switchProfile(mode: 'copy' | 'continue') {
    busy = mode; error = '';
    try { await window.desktop!.switchProfile(mode, selectedProfile); }
    catch (failure) { error = (failure as Error).message; busy = ''; }
  }
  async function finish() {
    busy = 'finish'; error = '';
    try { desktop.status = await window.desktop!.finishSetup(); }
    catch (failure) { error = (failure as Error).message; }
    finally { busy = ''; }
  }
</script>

<main class="startup" aria-labelledby="startup-title">
  <div class="startup-body">
    <header class="identity">
      <span>{status?.build.channel === 'preview' ? 'Music Preview' : 'Music'}</span>
      {#if status?.build.commit}<span class="build">{status.build.commit.slice(0, 7)}</span>{/if}
    </header>
    {#if starting}
      <section class="starting" aria-live="polite" aria-busy="true">
        <svg class="record" viewBox="0 0 80 80" aria-hidden="true"><circle cx="40" cy="40" r="36"/><circle cx="40" cy="40" r="28"/><circle cx="40" cy="40" r="20"/><circle cx="40" cy="40" r="7"/><path d="M40 4v12M40 64v12"/></svg>
        <h1 id="startup-title">Opening your library…</h1>
        <p>Music starts here. Your collection will fill in as it’s indexed.</p>
        <Button variant="ghost" onclick={() => window.close()}>Close Music</Button>
      </section>
    {:else if status?.phase === 'error' && !status.onboarding}
      <h1 id="startup-title">Reconnect your library.</h1>
      <p class="intro">Restart Music to reopen this profile.</p>
      <div class="finish"><Button onclick={() => window.desktop!.restart()}>Restart Music</Button></div>
    {:else if connectingSpotify}
      <h1 id="startup-title">Bring your Spotify library.</h1>
      <p class="intro">Connect your account, then choose where Spotify plays.</p>
      <div class="spotify-setup"><SpotifySettings onboarding /></div>
      <div class="finish">
        <Button disabled={!!busy} onclick={finish}>{spotify.connected ? 'Open my library' : 'Connect later'}</Button>
        <span>You can change this in Settings.</span>
      </div>
    {:else if status?.phase === 'ready' && !status.onboarding}
      <h1 id="startup-title">Your library is ready.</h1>
      <p class="intro">{problem ? 'Music couldn’t open the library view. Try connecting again.' : 'Opening your collection…'}</p>
      {#if problem}<Button onclick={onretry}>Retry opening library</Button>{/if}
    {:else}
      <h1 id="startup-title">Start with your music.</h1>
      <p class="intro">Choose your collection. Make it your own.</p>
      {#if status && !status.profile.existing}
        <p class="profile-note">{status.profile.portable ? 'This folder has its own library and preferences.' : 'This preview has its own library and preferences.'}</p>
      {/if}
      <div class="sources">
        <section class="source">
          <svg viewBox="0 0 32 32" aria-hidden="true"><path d="M3 9V7a2 2 0 0 1 2-2h8l3 4h11a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/><path d="M3 12h26"/></svg>
          <div><h2>A music folder</h2><p>Music scans your files where they are. Your originals stay in place.</p></div>
          <Button disabled={!!busy || !status} onclick={chooseFolder}>{busy === 'folder' ? 'Choosing folder…' : 'Choose folder'}</Button>
        </section>
        <section class="source">
          <svg viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="13"/><path d="M8 13c6-2 12-1 17 2M9 18c5-2 10-1 14 1M10 22c4-1 8-1 11 1"/></svg>
          <div><h2>Spotify</h2><p>Your albums, likes and playlists, played through Spotify.</p></div>
          <Button variant="outline" disabled={!!busy || !status} onclick={() => start('spotify')}>Connect Spotify</Button>
        </section>
      </div>
      <footer><Button variant="ghost" disabled={!!busy || !status} onclick={() => start('empty')}>Explore first</Button><span>Add a folder or Spotify whenever you’re ready.</span></footer>
      {#if status?.canCopy}
        <section class="existing">
          <div><h2>Already using Music?</h2><p>Quit the other version, then copy its library, history and preferences into this preview. Spotify may need reconnecting.</p></div>
          <Button variant="outline" disabled={!!busy} onclick={() => switchProfile('copy')}>{busy === 'copy' ? 'Copying profile…' : 'Copy existing profile'}</Button>
        </section>
      {/if}
      {#if profiles.length}
        <div class="continue-profile">
          <label for="startup-profile">Previous preview</label>
          <select id="startup-profile" bind:value={selectedProfile} disabled={!!busy}>
            {#each profiles as profile}<option value={profile.name}>{profile.label === profile.name ? profile.name : `${profile.label} · ${profile.name}`}</option>{/each}
          </select>
          <Button variant="outline" disabled={!!busy || !selectedProfile} onclick={() => switchProfile('continue')}>Continue</Button>
        </div>
      {/if}
    {/if}
    {#if problem}<p class="error" role="alert">{problem}</p>{/if}
  </div>
</main>

<style>
  .startup { height: 100dvh; overflow-y: auto; scrollbar-color: var(--ui-border) transparent; scrollbar-width: thin; box-sizing: border-box; display: grid; place-items: safe center; padding: 36px 32px; background: var(--ui-surface); color: var(--ui-text); font: 14px/1.5 var(--ui-font); overflow-wrap: anywhere; }
  .startup-body { width: min(720px, 100%); }
  .identity { display: flex; align-items: baseline; justify-content: space-between; gap: 16px; margin-bottom: 44px; font-size: 16px; font-weight: 600; }
  .build { color: var(--ui-text-muted); font-size: 12px; font-weight: 400; font-variant-numeric: tabular-nums; }
  h1 { margin: 0; font-size: clamp(28px, 4vw, 36px); line-height: 1.15; font-weight: 650; letter-spacing: -.025em; text-wrap: balance; }
  h2 { margin: 0 0 6px; font-size: 16px; line-height: 1.4; font-weight: 600; }
  p { margin: 0; max-width: 65ch; color: var(--ui-text-muted); }
  .intro { margin-top: 12px; font-size: 16px; }
  .profile-note { margin-top: 16px; font-size: 13px; }
  .sources { margin-top: 32px; border-top: 1px solid var(--ui-border); }
  .source { display: grid; grid-template-columns: 32px 1fr auto; gap: 20px; align-items: center; padding: 24px 0; border-bottom: 1px solid var(--ui-border); }
  .source svg { width: 32px; height: 32px; fill: none; stroke: currentColor; stroke-width: 1.5; stroke-linecap: round; stroke-linejoin: round; }
  .source p { max-width: 40ch; }
  .existing { display: flex; align-items: center; gap: 24px; margin-top: 32px; }
  .existing p { font-size: 13px; }
  .continue-profile { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; margin-top: 24px; }
  .continue-profile label { flex-basis: 100%; color: var(--ui-text-muted); font-size: 13px; }
  select { flex: 1; min-width: 0; padding: 10px 12px; background: var(--ui-muted); color: var(--ui-text); font: inherit; border: 1px solid var(--ui-border); border-radius: var(--ui-radius); }
  select:focus-visible { outline: 2px solid var(--ui-accent); outline-offset: 3px; }
  footer, .finish { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; margin-top: 32px; }
  footer > span, .finish > span { color: var(--ui-text-muted); font-size: 13px; }
  footer :global([data-slot=button]) { margin-left: -14px; }
  .startup :global([data-slot=button]) { min-height: 44px; }
  .error { margin-top: 24px; color: #ffb8ad; }
  .spotify-setup { margin-top: 32px; }
  .starting { padding: 28px 0 64px; }
  .starting p { margin: 16px 0 24px; }
  .record { width: 64px; height: 64px; margin-bottom: 32px; fill: none; stroke: var(--ui-text-muted); stroke-width: 1.5; animation: turn 4s linear infinite; }
  @keyframes turn { to { transform: rotate(360deg); } }
  @media (max-width: 600px) {
    .startup { padding: 24px 20px; place-items: start center; }
    .identity { margin-bottom: 36px; }
    .source { grid-template-columns: 28px 1fr; gap: 12px 16px; padding: 22px 0; }
    .source svg { width: 28px; height: 28px; align-self: start; }
    .source :global([data-slot=button]) { grid-column: 2; justify-self: start; }
    .existing { flex-direction: column; align-items: flex-start; gap: 16px; }
    footer { align-items: flex-start; gap: 4px; }
    footer > span { flex-basis: 100%; }
    .continue-profile select { flex-basis: 100%; width: 100%; }
  }
  @media (prefers-reduced-motion: reduce) { .record { animation: none; } }
</style>
