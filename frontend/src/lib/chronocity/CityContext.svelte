<script lang="ts">
  import type { Snippet } from 'svelte';
  import { createThrelteContext } from '@threlte/core/webgpu';
  import { ACESFilmicToneMapping, PCFShadowMap, type WebGPURenderer } from 'three/webgpu';
  let { canvas, dom, renderer, active, children }: { canvas: HTMLCanvasElement; dom: HTMLElement; renderer: WebGPURenderer; active: boolean; children: Snippet } = $props();
  createThrelteContext(() => ({ canvas, dom, createRenderer: () => renderer, autoRender: active, dpr: [1, 1.5], shadows: PCFShadowMap, toneMapping: ACESFilmicToneMapping }));
</script>
{@render children()}
