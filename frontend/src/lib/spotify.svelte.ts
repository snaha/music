import type { SpotifyDevice, SpotifyStatus } from './music';

export const spotify = $state<SpotifyStatus & { devices: SpotifyDevice[]; connecting: boolean }>({
  availability: 'checking', albums: [], indexedTracks: 0, indexing: false, indexError: '', inaccessiblePlaylists: 0, connected: false, account: '', clientId: '', collections: [], updatedAt: 0, syncing: false,
  progress: '', error: '', retryAt: 0, quotaBlocked: false, deviceId: '', deviceName: '', sameMac: false,
  devices: [], connecting: false,
});
export function initSpotify() {
  const api = window.spotify;
  if (!api) return () => {};
  const update = (s: SpotifyStatus) => { Object.assign(spotify, s); };
  const dispose = api.onChange(update);
  api.status().then(update).catch((error) => (spotify.error = error.message));
  const check = () => { if (!document.hidden) void checkSpotify(); };
  const activate = () => { if (!document.hidden) void checkSpotify(true); };
  const timer = setInterval(check, 30000);
  window.addEventListener('focus', activate); document.addEventListener('visibilitychange', activate); activate();
  return () => { dispose(); clearInterval(timer); window.removeEventListener('focus', activate); document.removeEventListener('visibilitychange', activate); };
}
export async function connectSpotify(clientId: string) {
  spotify.connecting = true; spotify.error = '';
  try { Object.assign(spotify, await window.spotify!.connect(clientId.trim())); await refreshDevices(); }
  catch (error) { spotify.error = (error as Error).message; }
  finally { spotify.connecting = false; }
}
export async function refreshDevices() {
  try { spotify.devices = await window.spotify!.devices(); }
  catch (error) { spotify.error = (error as Error).message; }
}
export async function refreshSpotify() {
  try { Object.assign(spotify, await window.spotify!.refresh()); }
  catch (error) { spotify.error = (error as Error).message; }
}
export async function disconnectSpotify() {
  try { Object.assign(spotify, await window.spotify!.disconnect()); spotify.devices = []; }
  catch (error) { spotify.error = (error as Error).message; }
}
export async function selectSpotifyDevice(id: string, sameMac: boolean) {
  try { Object.assign(spotify, await window.spotify!.selectDevice(id, sameMac)); }
  catch (error) { spotify.error = (error as Error).message; }
}

export function spotifyPlayable() { return !!window.spotify && spotify.connected && spotify.availability === 'ready'; }
export function spotifyDimmed() { return ['disconnected', 'reconnect', 'offline', 'restricted'].includes(spotify.availability); }
export function spotifyMessage() {
  return { checking: 'Checking Spotify output…', ready: 'Spotify ready', disconnected: 'Spotify disconnected · showing saved library',
    reconnect: 'Reconnect Spotify to play · showing saved library', offline: 'Spotify offline · showing saved library',
    'device-unavailable': 'Spotify playback output unavailable', restricted: 'Spotify access restricted · check Premium and app access' }[spotify.availability];
}
export function spotifyRecoveryLabel() {
  return spotify.availability === 'disconnected' ? 'Connect Spotify' : spotify.availability === 'reconnect' ? 'Reconnect Spotify' : spotify.availability === 'device-unavailable' ? 'Choose output' : 'Retry';
}
export async function checkSpotify(force = false) {
  try { if (window.spotify?.checkAvailability) Object.assign(spotify, await window.spotify.checkAvailability(force)); }
  catch (error) { spotify.error = (error as Error).message; }
}
export async function removeSpotifyLibrary() {
  if (!window.confirm('Disconnect Spotify and remove its saved library from this device?')) return;
  try { Object.assign(spotify, await window.spotify!.removeLibrary()); spotify.devices = []; }
  catch (error) { spotify.error = (error as Error).message; }
}
