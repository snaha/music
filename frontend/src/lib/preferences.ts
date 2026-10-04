// One guarded boundary for device preferences. Failed writes remain retryable.
const pending = new Map<string, string | null>();
const listeners = new Set<(error: string) => void>();
let error = '';
function report(message: string) { error = message; for (const listener of listeners) listener(error); }
export function subscribePreferences(listener: (error: string) => void) { listeners.add(listener); listener(error); return () => { listeners.delete(listener); }; }
export function readPreference(key: string, fallback = ''): string {
  try { return localStorage.getItem(key) ?? fallback; }
  catch { report('Device preferences are unavailable. This session still works.'); return fallback; }
}
export function readJsonPreference<T>(key: string, fallback: T): T {
  try { return JSON.parse(readPreference(key, JSON.stringify(fallback))) as T; }
  catch { report('A saved preference could not be read. Using its default for this session.'); return fallback; }
}
export function writePreference(key: string, value: string | null): boolean {
  try {
    if (value === null) localStorage.removeItem(key); else localStorage.setItem(key, value);
    pending.delete(key); if (!pending.size) report(''); return true;
  } catch { pending.set(key, value); report('Changes could not be saved on this device. Your current session still works.'); return false; }
}
export function retryPreferences() { for (const [key, value] of [...pending]) writePreference(key, value); }
export function dismissPreferenceError() { report(''); }
