import { BrowserWindow, net, protocol } from 'electron';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { readJSON, saveProfile } from './profiles.js';

// Migrate the old localhost origin inside this profile's Chromium session. HTTP
// interception serves an inert document, so no old app or server is contacted.
// Settings, tags, browser history and the custom background move together.
export async function migrateStorage(profile, config, timeoutMs = 5000) {
  if (config.storageOrigin === 'app://music') return;
  const credentials = path.join(profile.directory, 'navidrome', 'credentials.json');
  const oldCredentials = existsSync(credentials) ? readJSON(credentials) : {};
  const oldPort = oldCredentials.webPort;
  if (!Number.isInteger(oldPort) || oldPort < 1 || oldPort > 65535) {
    config.storageOrigin = 'app://music'; saveProfile(profile, config); return;
  }
  const oldOrigin = `http://127.0.0.1:${oldPort}`;
  const migrationPath = '/__music_storage_migration';
  const window = new BrowserWindow({ show: false, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false } });
  let intercepted = false, timedOut = false;
  let timeout;
  try {
    protocol.handle('http', request => request.url === `${oldOrigin}${migrationPath}`
    ? new Response('<!doctype html><title>Music storage migration</title>', { headers: { 'content-type': 'text/html' } })
    : net.fetch(request, { bypassCustomProtocolHandlers: true }));
    intercepted = true;
    const migration = (async () => {
      await window.loadURL(`${oldOrigin}${migrationPath}`);
      const data = await window.webContents.executeJavaScript(`(async () => {
        const values = Object.fromEntries(Object.keys(localStorage).map(key => [key, localStorage.getItem(key)]));
        // Credentials are injected by the desktop bridge; don't carry obsolete server ports.
        delete values.creds;
        const historyPrefix = ${JSON.stringify(`music.history.v1:http://127.0.0.1:${oldCredentials.port}:`)};
        for (const [key, value] of Object.entries(values)) if (key.startsWith(historyPrefix)) values['music.history.v1:desktop:' + key.slice(historyPrefix.length)] ??= value;
        let background = null;
        if ((await indexedDB.databases()).some(database => database.name === 'musicapp')) {
          const database = await new Promise((resolve, reject) => { const request = indexedDB.open('musicapp'); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
          if (database.objectStoreNames.contains('kv')) {
            const blob = await new Promise((resolve, reject) => { const request = database.transaction('kv').objectStore('kv').get('background'); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
            if (blob) background = { type: blob.type, bytes: Array.from(new Uint8Array(await blob.arrayBuffer())) };
          }
          database.close();
        }
        return { values, background };
      })()`);
      await window.loadURL('app://music/__music_storage_migration');
      await window.webContents.executeJavaScript(`(async () => {
        const data = ${JSON.stringify(data)};
        for (const [key, value] of Object.entries(data.values)) if (localStorage.getItem(key) === null) localStorage.setItem(key, value);
        if (data.background) {
          const database = await new Promise((resolve, reject) => { const request = indexedDB.open('musicapp', 1); request.onupgradeneeded = () => request.result.createObjectStore('kv'); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
          await new Promise((resolve, reject) => { const transaction = database.transaction('kv', 'readwrite'); const store = transaction.objectStore('kv'); const existing = store.get('background'); existing.onsuccess = () => { if (!existing.result) store.put(new Blob([new Uint8Array(data.background.bytes)], { type: data.background.type }), 'background'); }; transaction.oncomplete = resolve; transaction.onerror = transaction.onabort = () => reject(transaction.error); });
          database.close();
        }
      })()`);
      if (timedOut) return;
      config.storageOrigin = 'app://music'; saveProfile(profile, config);
    })();
    await Promise.race([migration, new Promise((_, reject) => {
      timeout = setTimeout(() => { timedOut = true; reject(new Error('Storage import timed out')); }, timeoutMs);
    })]);
  } finally {
    clearTimeout(timeout);
    if (intercepted) protocol.unhandle('http');
    if (!window.isDestroyed()) window.destroy();
  }
}
