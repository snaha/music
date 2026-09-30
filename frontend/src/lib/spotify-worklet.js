import { PCMBuffer } from './spotify-pcm.js';
class SpotifyAnalysis extends AudioWorkletProcessor {
  constructor() { super(); this.buffer = new PCMBuffer(sampleRate); this.stopped = false; this.port.onmessage = ({ data }) => { if (data.stop) { this.stopped = true; this.buffer.data.fill(0); this.port.close(); return; } this.buffer.push(data.samples, data.sampleRate); this.port.postMessage('ready'); }; }
  /** @param {Float32Array[][]} _inputs @param {Float32Array[][]} outputs */
  process(_inputs, outputs) { if (this.stopped) return false; this.buffer.render(outputs[0]); return true; }
}
registerProcessor('spotify-analysis', SpotifyAnalysis);
