import path from 'node:path';

export class SpotifyCapture {
  constructor({ send, sameMac, loadNative, platform = process.platform } = {}) {
    this.platform = platform; this.send = send; this.sameMac = sameMac; this.loadNative = loadNative ?? (() => {
      const module = { exports: {} };
      process.dlopen(module, path.join(import.meta.dirname, 'native/build/spotify-tap.node'));
      return module.exports;
    });
    this.state = { status: 'off', message: '', peak: 0, sampleRate: 0 };
    this.native = null; this.timer = null; this.watch = null; this.sequence = 0; this.inflight = 0; this.ackMillis = 0;
  }
  notify(status, message = '') { this.state = { ...this.state, status, message }; this.send('state', this.state); }
  start() {
    this.stop();
    if (this.platform !== 'darwin') throw new Error('Spotify visualization requires macOS 14.2 or later.');
    if (!this.sameMac()) throw new Error('Spotify visualization requires Spotify Desktop on this Mac. Select it in Settings.');
    try {
      this.native ??= this.loadNative();
      try { this.restart(); } catch (error) { this.notify('unavailable', error.message); }
      this.timer = setInterval(() => { try { this.pump(); } catch (error) { this.stop(); this.notify('error', error.message); } }, 16);
      this.watch = setInterval(() => {
        if (!this.sameMac()) { this.stop(); this.notify('unavailable', 'Spotify output changed. Select this Mac to visualize its audio.'); return; }
        const signature = this.native.signature();
        if (signature !== this.signature || this.state.status === 'unavailable') {
          try { this.restart(); } catch (error) { this.notify('unavailable', error.message); }
        }
      }, 2000);
      return this.state;
    } catch (error) { this.stop(); this.notify('error', `${error.message} Use pnpm dev:capture for the permission-enabled local app.`); throw new Error(this.state.message); }
  }
  restart() {
    this.native.stop(); this.state.sampleRate = this.native.start(); this.signature = this.native.signature();
    this.started = Date.now(); this.lastSignal = this.started; this.lastState = 0; this.inflight = 0;
    this.notify('listening', 'Listening to Spotify on this Mac…');
  }
  pump() {
    if (this.state.status === 'unavailable') return;
    const samples = this.native.read();
    let peak = 0; for (const sample of samples) peak = Math.max(peak, Math.abs(sample));
    this.state.peak = peak;
    if (peak > 0.00001) this.lastSignal = Date.now();
    if (samples.length && !this.inflight) {
      // Exactly one PCM batch outstanding. Renderer acknowledgments bound the IPC queue.
      const sequence = ++this.sequence; this.inflight = sequence; this.inflightAt = Date.now();
      this.send('samples', { samples, sampleRate: this.state.sampleRate, sequence });
    }
    if (Date.now() - this.lastState > 1000) {
      this.lastState = Date.now();
      const silent = Date.now() - this.lastSignal > 5000;
      if (process.env.MUSIC_DIAGNOSTICS === '1') console.log('[capture-metrics]', JSON.stringify({ peak, sampleRate: this.state.sampleRate, batchFrames: samples.length / 2, ipcPending: !!this.inflight, rendererAckMs: this.ackMillis }));
      this.notify(silent ? 'silent' : 'listening', silent ? 'No Spotify audio detected. Play a track on this Mac; if it is already playing, check Music’s audio-capture permission in System Settings.' : 'Spotify audio connected');
    }
  }
  ack(sequence) { if (sequence === this.inflight) { this.ackMillis = Date.now() - this.inflightAt; this.inflight = 0; } }
  stop() {
    clearInterval(this.timer); clearInterval(this.watch); this.timer = this.watch = null; this.native?.stop(); this.inflight = 0;
    this.notify('off');
  }
}
