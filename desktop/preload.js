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

contextBridge.exposeInMainWorld('musicHistory', {
  stats: (query) => ipcRenderer.invoke('music-history:stats', query),
  write: (batch) => ipcRenderer.invoke('music-history:write', batch),
  list: (query) => ipcRenderer.invoke('music-history:list', query),
  clear: (scope) => ipcRenderer.invoke('music-history:clear', { scope }),
});
