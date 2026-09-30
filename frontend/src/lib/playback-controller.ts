import type { Track, Source } from './music.ts';

export type PlaybackAdapter = {
  available(track: Track): void;
  prepare(track: Track): Promise<void>;
  start(track: Track): Promise<void>;
  pause(): Promise<void>;
  resume(): Promise<void>;
  seek(seconds: number): Promise<void>;
};

// Every operation joins one serial lane. New intentions invalidate queued work; in-flight
// provider commands must settle before another provider is allowed to make sound.
export class PlaybackController {
  private revision = 0;
  private tail: Promise<void> = Promise.resolve();
  active: Source | undefined;
  current: Track | undefined;
  private adapters: Record<Source, PlaybackAdapter>;
  constructor(adapters: Record<Source, PlaybackAdapter>) { this.adapters = adapters; }

  private schedule(operation: (current: () => boolean) => Promise<void>) {
    const revision = ++this.revision;
    const task = this.tail.catch(() => {}).then(async () => {
      if (revision !== this.revision) return;
      await operation(() => revision === this.revision);
    });
    this.tail = task;
    return task;
  }

  play(track: Track) {
    return this.schedule(async (current) => {
      const next = this.adapters[track.source];
      if (this.active) await this.adapters[this.active].pause();
      if (!current()) return;
      next.available(track);
      await next.prepare(track);
      if (!current()) return;
      this.active = track.source; this.current = track;
      try { await next.start(track); }
      catch (error) { await next.pause().catch(() => {}); throw error; }
      if (!current()) await next.pause();
    });
  }
  pause() { return this.schedule(async () => { if (this.active) await this.adapters[this.active].pause(); }); }
  resume() { return this.schedule(async () => { if (this.active) await this.adapters[this.active].resume(); }); }
  seek(seconds: number) { return this.schedule(async () => { if (this.active) await this.adapters[this.active].seek(seconds); }); }
  // Remember the outgoing provider so an explicit retry still stops it before a handoff.
  suspend() { this.revision++; }
  // External Spotify interaction releases automatic ownership without sending a command back.
  release() { this.revision++; this.active = undefined; this.current = undefined; }
}
