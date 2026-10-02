type PlaybackEvent = { at: string; event: string; detail: Record<string, string | number | boolean | null> };
const key = 'music.playback-log.v1';
let events: PlaybackEvent[] = [];
try { const saved = JSON.parse(localStorage.getItem(key) || '[]'); if (Array.isArray(saved)) events = saved.slice(-100); } catch {}
// Local, bounded diagnostics. Never include credentials, URLs or account names.
export function logPlayback(event: string, detail: PlaybackEvent['detail'] = {}) {
  events.push({ at: new Date().toISOString(), event, detail });
  events = events.slice(-100);
  try { localStorage.setItem(key, JSON.stringify(events)); } catch {}
}
export function playbackLog() { return JSON.stringify({ version: 1, events }, null, 2); }
export function downloadPlaybackLog() {
  const url = URL.createObjectURL(new Blob([playbackLog()], { type: 'application/json' }));
  const link = document.createElement('a'); link.href = url; link.download = 'music-playback-log.json'; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
