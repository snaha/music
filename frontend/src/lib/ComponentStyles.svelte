<script lang="ts">
  import { reveal } from './ui/motion';
  import { ui, COMPONENT_STYLES, type ComponentStyle } from './ui-style.svelte';
  let { onclose }: { onclose: () => void } = $props();
  const descriptions = { classic: 'Compact, neutral controls', studio: 'Clean surfaces with lime accents', neon: 'Soft shapes with violet accents' };
</script>
<aside class="component-panel" aria-label="Component styles" in:reveal={{ x: 32, duration: 260 }} out:reveal={{ x: 16, duration: 140 }}>
  <header><div><h2>Components</h2><p>Choose how your controls feel.</p></div><button onclick={onclose} aria-label="Close component styles"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="m6 6 12 12M6 18 18 6" /></svg></button></header>
  {#each Object.entries(COMPONENT_STYLES) as [key, title]}
    <button class="style-card" class:chosen={ui.components === key} aria-pressed={ui.components === key} onclick={() => (ui.components = key as ComponentStyle)}>
      <div class="style-title"><strong>{title}</strong><span>{ui.components === key ? '✓' : ''}</span></div>
      <p>{descriptions[key as ComponentStyle]}</p>
      <div class="preview" data-preview={key} aria-hidden="true"><span class="preview-tab">Albums</span><span class="preview-input">Search music…</span><span class="preview-play">▶ Play</span><span class="preview-range"><i></i></span></div>
    </button>
  {/each}
  <small>Applies immediately. Your queue and library stay in place.</small>
</aside>
<style>
.component-panel { position: fixed; top: var(--topbar, 90px); right: 0; bottom: var(--botbar, 0px); width: min(350px, 92vw); box-sizing: border-box; padding: 24px; overflow: auto; z-index: 5; background: var(--ui-surface); border-left: 1px solid var(--ui-border); box-shadow: -12px 0 40px #0005; color: var(--ui-text); }
header, .style-title { display: flex; justify-content: space-between; align-items: center; } h2 { margin: 0; font-size: 20px; } p { margin: 7px 0 16px; color: var(--ui-text-muted); font-size: 13px; } header button { width: 36px; height: 36px; display: grid; place-items: center; border-radius: var(--ui-radius); background: transparent; border: 0; color: var(--ui-text-muted); font-size: 26px; cursor: pointer; }
.style-card { width: 100%; text-align: left; background: var(--ui-muted); color: var(--ui-text); border: 1px solid var(--ui-border); border-radius: 12px; padding: 16px; margin-bottom: 14px; cursor: pointer; } .style-card.chosen { border-color: var(--ui-accent); } .style-card:focus-visible { outline: 2px solid var(--ui-accent); outline-offset: 3px; }
.preview { --accent: #eee; --radius: 3px; display: flex; gap: 8px; flex-wrap: wrap; align-items: center; padding: 12px; background: #111; border-radius: 8px; font-size: 11px; pointer-events: none; } .preview[data-preview=studio] { --accent: #a3e635; --radius: 8px; } .preview[data-preview=neon] { --accent: #c4b5fd; --radius: 14px; background: #151427; }
.preview-tab, .preview-play { background: var(--accent); color: #111; padding: 6px 9px; border-radius: var(--radius); } .preview-input { padding: 6px 8px; border: 1px solid #ffffff30; border-radius: var(--radius); color: #999; } .preview-range { display: block; height: 4px; background: #ffffff30; width: 100%; margin-top: 5px; border-radius: 4px; } .preview-range i { display: block; height: 4px; width: 60%; background: var(--accent); } small { color: #999; font-size: 12px; }
</style>

