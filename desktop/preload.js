// hands the frontend the local server address and credentials so it can log in silently
import { contextBridge, ipcRenderer } from 'electron';
const arg = process.argv.find((a) => a.startsWith('--desktop='));
if (arg) contextBridge.exposeInMainWorld('desktop', { ...JSON.parse(arg.slice('--desktop='.length)), lanIp: () => ipcRenderer.invoke('lan-ip'), setFrame: (on) => ipcRenderer.invoke('set-frame', on) });

const call = async (name, ...args) => {
  const reply = await ipcRenderer.invoke(`spotify:${name}`, ...args);
  if (reply.error) throw Object.assign(new Error(reply.error), { status: reply.status, retryAt: reply.retryAt });
  return reply.value;
};
contextBridge.exposeInMainWorld('spotify', {
  status: () => call('status'), connect: (id) => call('connect', id), cancel: () => call('cancel'),
  checkAvailability: (force) => call('check-availability', force), removeLibrary: () => call('remove-library'),
  disconnect: () => call('disconnect'), refresh: () => call('refresh'),
  albumTracks: (id, offset, snapshot) => call('album-tracks', id, offset, snapshot), transition: (active) => call('transition', active),
  tracks: (id, offset) => call('tracks', id, offset), devices: () => call('devices'),
  selectDevice: (id, sameMac) => call('select-device', id, sameMac), playback: () => call('playback'),
  command: (action, value) => call('command', action, value), external: (url) => call('external', url),
  onChange: (callback) => {
    const listener = (_event, snapshot) => callback(snapshot);
    ipcRenderer.on('spotify:changed', listener);
    return () => ipcRenderer.removeListener('spotify:changed', listener);
  },
});

contextBridge.exposeInMainWorld('spotifyCapture', {
  start: () => ipcRenderer.invoke('capture:start'), stop: () => ipcRenderer.invoke('capture:stop'),
  onSamples: (callback) => { const listener = (_event, data) => { try { callback(data); } finally { ipcRenderer.send('capture:ack', data.sequence); } }; ipcRenderer.on('capture:samples', listener); return () => ipcRenderer.removeListener('capture:samples', listener); },
  onState: (callback) => { const listener = (_event, data) => callback(data); ipcRenderer.on('capture:state', listener); return () => ipcRenderer.removeListener('capture:state', listener); },
});

contextBridge.exposeInMainWorld('musicHistory', {
  write: (batch) => ipcRenderer.invoke('music-history:write', batch),
  list: (query) => ipcRenderer.invoke('music-history:list', query),
  clear: (scope) => ipcRenderer.invoke('music-history:clear', { scope }),
});
