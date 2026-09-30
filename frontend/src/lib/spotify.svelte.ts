import type { SpotifyDevice, SpotifyStatus } from './music';

export const spotify = $state<SpotifyStatus & { devices: SpotifyDevice[]; connecting: boolean }>({
  albums: [], indexedTracks: 0, indexing: false, indexError: '', inaccessiblePlaylists: 0, connected: false, account: '', clientId: '', collections: [], updatedAt: 0, syncing: false,
  progress: '', error: '', retryAt: 0, quotaBlocked: false, deviceId: '', deviceName: '', sameMac: false,
  devices: [], connecting: false,
});
export function initSpotify() {
  const api = window.spotify;
  if (!api) return () => {};
  const update = (s: SpotifyStatus) => { Object.assign(spotify, s); };
  const dispose = api.onChange(update);
  api.status().then(update).catch((error) => (spotify.error = error.message));
  return dispose;
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
