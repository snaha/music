// Credentials and startup state are read after the selected profile is ready.
import { contextBridge, ipcRenderer } from 'electron';
const desktopCall = async (name, ...args) => {
  const reply = await ipcRenderer.invoke(`desktop:${name}`, ...args);
  if (reply.error) throw new Error(reply.error);
  return reply.value;
};
contextBridge.exposeInMainWorld('desktop', {
  status: () => desktopCall('status'), start: options => desktopCall('start', options),
  chooseFolder: () => desktopCall('choose-folder'), finishSetup: () => desktopCall('finish-setup'),
  profiles: () => desktopCall('profiles'), switchProfile: (mode, name) => desktopCall('switch-profile', mode, name),
  showData: () => desktopCall('show-data'), changeFolder: (mode, folder) => desktopCall('change-folder', mode, folder),
  restart: () => desktopCall('restart'),
  lanIp: () => desktopCall('lan-ip'), setFrame: on => desktopCall('set-frame', on),
  onChange: callback => {
    const listener = (_event, value) => callback(value);
    ipcRenderer.on('desktop:changed', listener);
    return () => ipcRenderer.removeListener('desktop:changed', listener);
  },
});

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
  search: (query, offset) => call('search', query, offset),
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
  stats: (query) => ipcRenderer.invoke('music-history:stats', query),
  write: (batch) => ipcRenderer.invoke('music-history:write', batch),
  list: (query) => ipcRenderer.invoke('music-history:list', query),
  clear: (scope) => ipcRenderer.invoke('music-history:clear', { scope }),
});
