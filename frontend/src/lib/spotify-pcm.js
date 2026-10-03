// Fixed-size stereo ring; transient analysis samples only. No file/network access.
export class PCMBuffer {
  /** @param {number} rate */
  constructor(rate, capacity = 32768) { this.rate = rate; this.capacity = capacity; this.data = new Float32Array(capacity * 2); this.read = 0; this.write = 0; this.position = 0; this.sourceRate = rate; }
  /** @param {Float32Array} samples @param {number} rate */
  push(samples, rate) {
    if (!Number.isFinite(rate) || rate <= 0) return;
    if (rate !== this.sourceRate) { this.read = this.write = this.position = 0; this.sourceRate = rate; }
    const frames = Math.floor(samples.length / 2), start = Math.max(0, frames - this.capacity);
    for (let i = start; i < frames; i++) { const at = (this.write++ % this.capacity) * 2; this.data[at] = samples[i * 2]; this.data[at + 1] = samples[i * 2 + 1]; }
    // Keep latency bounded to 125 ms even after a suspended renderer.
    this.read = Math.max(this.read, this.write - Math.min(this.capacity, Math.ceil(rate / 8)));
  }
  /** @param {Float32Array[]} channels */
  render(channels) {
    const ratio = this.sourceRate / this.rate;
    for (let frame = 0; frame < channels[0].length; frame++) {
      if (this.read + 1 >= this.write) { for (const channel of channels) channel[frame] = 0; continue; }
      const at = (this.read % this.capacity) * 2, next = ((this.read + 1) % this.capacity) * 2;
      for (let c = 0; c < channels.length; c++) channels[c][frame] = this.data[at + c % 2] * (1 - this.position) + this.data[next + c % 2] * this.position;
      this.position += ratio; const advance = Math.floor(this.position); this.read += advance; this.position -= advance;
    }
  }
}
