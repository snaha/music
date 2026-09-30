<script lang="ts">
  import Button from './ui/button.svelte';
  import Drawer from './Drawer.svelte';
  import SpotifySettings from './SpotifySettings.svelte';
  import { session } from './api.svelte';
  import { bg, clearBackground, importBackground } from './background.svelte';

  let { art = $bindable(), motion = $bindable(), onclose }: { art: boolean; motion: boolean; onclose: () => void } = $props();
  let paste = $state(''), bad = $state(false);
  let backgroundFile: HTMLInputElement;
  // a picked file, or SVG / CSS pasted from a generator (fffuel's "copy SVG" or eeencode output)
  async function load(src: File | string) { bad = !(await importBackground(src)); if (!bad) paste = ''; }
</script>

<Drawer from="right" {onclose}>
  <div class="body">
    <h1>Settings</h1>
    <section>
      <h2>Appearance</h2>
      <label><input type="checkbox" bind:checked={art} /> With art</label>
      <label><input type="checkbox" bind:checked={motion} /> Motion</label>
      <details>
        <summary>Background customization</summary>
        <div class="detail-body">
          <label><input type="checkbox" bind:checked={bg.scroll} /> Background scrolls with the cards</label>
          <label><input type="checkbox" bind:checked={bg.tile} disabled={bg.material !== 'custom' && bg.material !== 'noise'} /> Tile the image / svg background</label>
          <p class="import">
            <span class="k">Custom image / SVG background</span>
            <input bind:this={backgroundFile} hidden type="file" accept="image/svg+xml,image/png,image/jpeg,image/webp" onchange={(e) => { const f = e.currentTarget.files?.[0]; if (f) load(f); e.currentTarget.value = ''; }} />
            <Button variant="outline" size="sm" onclick={() => backgroundFile.click()}>Choose file</Button>
            <input type="text" aria-label="Paste SVG or CSS background" placeholder="Or paste SVG / CSS" bind:value={paste} spellcheck="false" onchange={() => paste.trim() && load(paste)} />
            {#if bg.custom}<Button variant="outline" size="sm" onclick={clearBackground}>Clear</Button>{/if}
            {#if bad}<span class="err">choose an svg, png, jpeg or webp image</span>{/if}
          </p>
        </div>
      </details>
    </section>
    <SpotifySettings />
    <section class="advanced">
      <details>
        <summary>Advanced &amp; network</summary>
        <div class="detail-body">
          {#if window.desktop}
            <!-- the window reopens with or without the frame, which restarts playback -->
            <label><input type="checkbox" checked={window.desktop.frame} onchange={(e) => window.desktop!.setFrame(e.currentTarget.checked)} /> Native window frame</label>
          {/if}
          <h2>Network</h2>
          <p><span class="k">Server</span> <span class="v">{session.base}</span></p>
        </div>
      </details>
    </section>
  </div>
</Drawer>

<style>
  .body { flex: 1; min-width: 0; overflow-y: auto; padding: 28px 24px; scrollbar-width: thin; scrollbar-color: var(--ui-border) var(--ui-surface); display: flex; flex-direction: column; gap: 24px; font: 14px/1.5 var(--ui-font); color: var(--ui-text); }
  h1 { margin: 0; font-size: 22px; line-height: 1.2; font-weight: 650; letter-spacing: -.025em; }
  h2 { margin: 0 0 12px; font-size: 16px; font-weight: 600; letter-spacing: -.015em; }
  section { border-top: 1px solid var(--ui-border); padding-top: 20px; }
  label { display: flex; align-items: center; gap: 12px; min-height: 44px; cursor: pointer; }
  input[type=checkbox] { flex-shrink: 0; margin: 0; width: 18px; height: 18px; accent-color: var(--ui-accent); cursor: pointer; }
  input:focus-visible { outline: 2px solid var(--ui-accent); outline-offset: 3px; }
  p { margin: 0; display: flex; gap: 12px; align-items: center; flex-wrap: wrap; }
  details { margin-top: 12px; }
  summary { min-height: 44px; display: flex; align-items: center; justify-content: space-between; gap: 12px; font-weight: 550; cursor: pointer; list-style: none; color: var(--ui-text-muted); }
  summary::-webkit-details-marker { display: none; }
  summary::after { content: ""; width: 7px; height: 7px; border-right: 1.5px solid currentColor; border-bottom: 1.5px solid currentColor; transform: rotate(45deg); transition: transform 180ms ease-out; margin-right: 4px; }
  details[open] > summary::after { transform: rotate(225deg); }
  summary:hover, details[open] > summary { color: var(--ui-text); }
  summary:focus-visible { outline: 2px solid var(--ui-accent); outline-offset: 3px; border-radius: var(--ui-radius); }
  .detail-body { padding: 8px 0 12px; }
  .advanced details { margin: 0; }
  .advanced h2 { margin-top: 16px; font-size: 14px; }
  @media (prefers-reduced-motion: reduce) { summary::after { transition: none; } }
  .import { margin-top: 18px; }
  .import .k { flex-basis: 100%; }
  input[type=text] { box-sizing: border-box; width: min(260px, 100%); min-width: 0; padding: 9px 12px; border: 1px solid var(--ui-border); border-radius: var(--ui-radius); background: var(--ui-muted); color: var(--ui-text); font: inherit; caret-color: var(--ui-accent); }
  input[type=text]::placeholder { color: var(--ui-text-muted); opacity: 1; }
  label:has(input:disabled) { color: var(--ui-text-muted); cursor: default; }
  input:disabled { opacity: .5; }
  .err { color: #ffb8ad; }
  .k { color: var(--ui-text-muted); }
  .v { user-select: text; overflow-wrap: anywhere; font-variant-numeric: tabular-nums; }
  @media (max-width: 700px) { .body { padding: 24px 18px; } .body :global([data-slot=button]), input[type=text] { min-height: 44px; } }
</style>
