import { parentPort, workerData } from 'node:worker_threads';
import { MusicStore } from './music-store.js';
const store = new MusicStore(workerData.file);
parentPort.on('message', ({ id, method, args }) => {
  try {
    if (!['write', 'list', 'clear', 'stats', 'close'].includes(method)) throw new Error('Unknown music database operation');
    const value = store[method](args);
    parentPort.postMessage({ id, value });
    if (method === 'close') parentPort.close();
  } catch (error) { parentPort.postMessage({ id, error: error.message }); }
});
