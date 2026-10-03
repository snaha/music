<script lang="ts">
  import type { Snippet } from 'svelte';
  import { WebGPURenderer } from 'three/webgpu';
  import CityContext from './CityContext.svelte';
  let { active, children, onbackend, onerror }: { active: boolean; children: Snippet; onbackend: (backend: string) => void; onerror: () => void } = $props();
  let canvas = $state.raw<HTMLCanvasElement>(), dom = $state.raw<HTMLDivElement>(), renderer = $state.raw<WebGPURenderer>();
  $effect(() => {
    if (!canvas) return;
    const surface = canvas;
    const instance = new WebGPURenderer({ canvas: surface, antialias: true, forceWebGL: new URLSearchParams(location.search).get('chronocity-backend') === 'webgl' });
    let cancelled = false, handedOff = false;
    const dispose = () => { try { instance.dispose(); } catch { /* An initialization failure can leave the backend incomplete. */ } };
    const lost = (event: Event) => { event.preventDefault(); onerror(); };
    surface.addEventListener('webglcontextlost', lost);
    instance.init().then(() => {
      if (cancelled) { dispose(); return; }
      onbackend('isWebGPUBackend' in instance.backend && instance.backend.isWebGPUBackend ? 'webgpu' : 'webgl');
      handedOff = true;
      renderer = instance;
    }).catch(() => { dispose(); if (!cancelled) onerror(); });
    return () => {
      cancelled = true;
      surface.removeEventListener('webglcontextlost', lost);
      // Once mounted, Threlte's context owns renderer disposal and the animation loop.
      if (!handedOff) renderer = undefined;
    };
  });
</script>
<div bind:this={dom}><canvas bind:this={canvas}>{#if renderer && canvas && dom}<CityContext {renderer} {canvas} {dom} {active}>{@render children()}</CityContext>{/if}</canvas></div>
<style>
  div, canvas { position: relative; display: block; width: 100%; height: 100%; }
  div { overflow: hidden; }
</style>
