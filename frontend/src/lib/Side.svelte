<script lang="ts">
  import { tick, type Snippet } from 'svelte';

  let { side, label, touch, pinned = false, menu = $bindable(false), open = $bindable(false), width = $bindable(0), onunpin, children }: {
    side: 'left' | 'right'; label: string; touch: boolean; pinned?: boolean;
    menu?: boolean; open?: boolean; width?: number; onunpin?: () => void; children: Snippet;
  } = $props();
  const right = $derived(side === 'right');
  let corner: HTMLElement, panel: HTMLElement, trigger: HTMLButtonElement;
  $effect(() => { open = menu || pinned; });

  function close() { menu = false; if (pinned) onunpin?.(); }
  function focusItem(last = false) {
    const items = panel.querySelectorAll<HTMLButtonElement>('button:not(:disabled)');
    (last ? items[items.length - 1] : items[0])?.focus();
  }
  function onkeydown(e: KeyboardEvent) {
    const items = [...panel.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
    const index = items.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); trigger.focus(); }
    else if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) {
      e.preventDefault();
      const next = e.key === 'Home' ? 0 : e.key === 'End' ? items.length - 1 : (index + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
      items[next]?.focus();
    }
  }
</script>

<svelte:window onpointerdown={(e) => { const target = e.target as Node; if (open && !pinned && !corner.contains(target) && !panel.contains(target)) close(); }} />

<span class="corner" class:right bind:this={corner}>
  <button class="menu" class:down={open} bind:this={trigger} aria-label="{right ? 'Display' : 'Library'} menu: {label}" aria-haspopup="menu" aria-expanded={open}
    onclick={() => { if (open) close(); else menu = true; }}
    onkeydown={(e) => { if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); menu = true; requestAnimationFrame(() => focusItem(e.key === 'ArrowUp')); } else if (e.key === 'Escape') { e.stopPropagation(); close(); } }}>
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
      {#if right}<path d="M4 4h16v6H4zM4 14h6v6H4zM14 14h6v6h-6z" />{:else}<path d="M4 6h16M4 12h16M4 18h16" />{/if}
    </svg>
    <span class="cur">{label}</span>
    <svg class="chevron" viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.5"><path d="m4 6 4 4 4-4" /></svg>
  </button>
</span>

<div class="side" class:right class:open class:touch role="menu" aria-label={right ? 'Display menu' : 'Library menu'} aria-hidden={!open} inert={!open}
  bind:this={panel} bind:clientWidth={width} {onkeydown}
  onclick={async (e) => { if (e.detail === 0) { await tick(); if (!open) trigger.focus(); } }}
  onfocusout={(e) => { if (e.relatedTarget instanceof Node && !panel.contains(e.relatedTarget) && !corner.contains(e.relatedTarget) && !pinned) close(); }}>
  {@render children()}
</div>

<style>
  .corner { position: absolute; left: 20px; top: 24px; }
  .corner.right { left: auto; right: 20px; }
  .menu { font: inherit; cursor: pointer; display: flex; align-items: center; gap: 10px; min-height: 40px; box-sizing: border-box; padding: 8px 12px; border: 0; border-radius: 6px; color: #c8c8ce; background: transparent; transition: color 140ms, background 140ms; }
  .menu:hover { background: #ffffff10; color: #fff; }
  .menu.down { color: #c4b5fd; background: #c4b5fd18; }
  .menu:focus-visible, .side :global(button:focus-visible) { outline: 2px solid #c4b5fd; outline-offset: 3px; }
  .chevron { transition: transform 180ms ease-out; }
  .down .chevron { transform: rotate(180deg); }
  .side { position: fixed; top: var(--topbar, 0px); left: 12px; width: 200px; max-height: calc(100dvh - var(--topbar, 0px) - 120px); overflow-y: auto; box-sizing: border-box;
    display: flex; flex-direction: column; gap: 4px; padding: 8px;
    background: #242428; border-radius: 12px; box-shadow: 0 12px 32px #0006;
    color: #eee; font: 13px/1.4 system-ui, sans-serif; user-select: none; scrollbar-width: thin; scrollbar-color: #686871 transparent;
    pointer-events: none; opacity: 0; transform: translateY(-6px);
    transition: transform 180ms cubic-bezier(.16,1,.3,1), opacity 140ms ease-out; }
  .side.right { left: auto; right: 12px; }
  .side.open { pointer-events: auto; opacity: 1; transform: translateY(0); }
  .side :global(button) { font: inherit; text-align: left; cursor: pointer; min-height: 40px; flex-shrink: 0; padding: 10px 12px; border: 0; border-radius: 6px; color: #c8c8ce; background: transparent; transition: color 140ms, background 140ms; }
  .side :global(button:hover) { background: #ffffff10; color: #fff; }
  .side :global(button.on) { color: #c4b5fd; background: #c4b5fd18; }
  .side :global(.rule) { flex-shrink: 0; height: 1px; background: #ffffff1c; margin: 4px 12px; }
  @media (max-width: 700px) {
    .corner { top: 12px; left: 12px; }
    .corner.right { left: auto; right: 12px; }
    .menu, .side :global(button) { min-height: 44px; }
    .side { width: min(240px, calc(100vw - 24px)); }
  }
  @media (prefers-reduced-motion: reduce) { .menu, .chevron, .side, .side :global(button) { transition: none; } }
</style>
