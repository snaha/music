<script lang="ts">
  import { ui, COMPONENT_STYLES, type ComponentStyle } from './ui-style.svelte';
</script>
<div class="theme-options" role="group" aria-label="Theme">
  {#each Object.entries(COMPONENT_STYLES) as [key, title]}
    <button class="style-card" data-theme={key} class:chosen={ui.components === key} aria-pressed={ui.components === key} onclick={() => (ui.components = key as ComponentStyle)}>
      <span class="swatch" aria-hidden="true"></span>{title}
    </button>
  {/each}
</div>
<style>
  .theme-options { display: flex; justify-content: center; align-items: center; flex-wrap: nowrap; overflow-x: auto; gap: 8px; }
  .style-card { display: inline-flex; align-items: center; gap: 9px; padding: 8px 12px; min-height: 40px; font: inherit; border: 1px solid var(--ui-border); border-radius: var(--ui-radius); background: transparent; color: var(--ui-text); cursor: pointer; transition: background-color 120ms, border-color 120ms; }
  .style-card:hover { background: var(--ui-muted); }
  .style-card.chosen { border-color: var(--ui-accent); background: var(--ui-muted); }
  .style-card:focus-visible { outline: 2px solid var(--ui-accent); outline-offset: 2px; }
  .swatch { width: 14px; height: 14px; border-radius: 4px; background: #eee; box-shadow: inset 0 0 0 1px #0002; }
  [data-theme=studio] .swatch { background: #a3e635; }
  [data-theme=neon] .swatch { background: #c4b5fd; border-radius: 50%; }
  [data-theme=coss] .swatch { background: #a3a3a3; }
  @media (max-width: 700px), (pointer: coarse) { .theme-options { justify-content: flex-start; } .style-card { min-height: 44px; padding: 8px 10px; flex-shrink: 0; } }
  @media (prefers-reduced-motion: reduce) { .style-card { transition: none; } }
</style>
