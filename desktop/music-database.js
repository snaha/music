import { Worker } from 'node:worker_threads';
export class MusicDatabase {
  constructor(file) {
    this.pending = new Map(); this.sequence = 0;
    this.worker = new Worker(new URL('./music-store-worker.js', import.meta.url), { workerData: { file } });
    this.worker.on('message', ({ id, value, error }) => {
      const request = this.pending.get(id); this.pending.delete(id);
      if (error) request?.reject(new Error(error)); else request?.resolve(value);
    });
    const fail = error => { this.failure = error; for (const request of this.pending.values()) request.reject(error); this.pending.clear(); };
    this.worker.on('error', fail);
    this.worker.on('exit', code => fail(new Error(`Music database worker stopped (${code})`)));
  }
  call(method, args) {
    if (this.failure || this.closing) return Promise.reject(this.failure || new Error('Music database is closing'));
    return new Promise((resolve, reject) => {
      const id = ++this.sequence;
      this.pending.set(id, { resolve, reject });
      try { this.worker.postMessage({ id, method, args }); }
      catch (error) { this.pending.delete(id); reject(error); }
    });
  }
  close() {
    return this.closing ??= this.call('close').finally(() => this.worker.terminate());
  }
}
