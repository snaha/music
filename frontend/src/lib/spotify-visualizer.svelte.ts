import { audioGraph } from './player.svelte';
import workletURL from './spotify-worklet.js?worker&url';

export const capture = $state({ enabled: localStorage.getItem('spotify-visualizer') === 'true', status: 'off', message: '', peak: 0 });
const owners = new Set<symbol>();
let version = 0, running = false, worklet: AudioWorkletNode | undefined;
let unsubscribe: (() => void)[] = [], ready: Promise<void> | undefined;
export function enableCapture(enabled: boolean) { capture.enabled = enabled; localStorage.setItem('spotify-visualizer', String(enabled)); }
export async function setCaptureActive(owner: symbol, requested: boolean) {
  if (requested) owners.add(owner); else owners.delete(owner);
  const active = owners.size > 0;
  if (active === running) return;
  running = active; const mine = ++version;
  for (const off of unsubscribe) off(); unsubscribe = [];
  worklet?.port.postMessage({ stop: true }); worklet?.disconnect(); worklet?.port.close(); worklet = undefined;
  await window.spotifyCapture?.stop();
  if (mine !== version) return;
  capture.status = 'off'; capture.message = ''; capture.peak = 0;
  if (!active) return;
  try {
    if (!window.spotifyCapture) throw new Error('Spotify visualization requires the Music desktop app on this Mac.');
    const { ctx, node } = audioGraph();
    ready ??= ctx.audioWorklet.addModule(workletURL).catch(error => { ready = undefined; throw error; });
    await ready;
    if (mine !== version) return;
    worklet = new AudioWorkletNode(ctx, 'spotify-analysis', { numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [2] });
    // The analysis bus has only a permanently zero-gain path to the speakers.
    worklet.connect(node);
    let busy = false;
    worklet.port.onmessage = () => { busy = false; };
    unsubscribe = [window.spotifyCapture.onSamples(data => {
      if (!worklet || busy) return;
      busy = true; const samples = new Float32Array(data.samples);
      worklet.port.postMessage({ samples, sampleRate: data.sampleRate }, [samples.buffer]);
    }), window.spotifyCapture.onState(state => { Object.assign(capture, state); })];
    await window.spotifyCapture.start();
  } catch (error) {
    if (mine === version) { capture.status = 'error'; capture.message = error instanceof Error ? error.message : String(error); }
  }
}
