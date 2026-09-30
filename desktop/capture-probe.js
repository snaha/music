import { app, BrowserWindow } from 'electron';
import path from 'node:path';
let tap;
app.whenReady().then(() => {
  const win = new BrowserWindow({ width: 650, height: 280, title: 'Music capture check' });
  win.loadURL('data:text/html,<body style="background:%23151517;color:white;font:18px system-ui;padding:30px"><h2>Spotify audio capture check</h2><p>Allow audio capture in the macOS prompt. Only Spotify audio is sampled, in memory. No recording is saved.</p><p>This check closes automatically after 90 seconds.</p>');
  try {
    const module = { exports: {} }; process.dlopen(module, path.join(import.meta.dirname, 'native/build/spotify-tap.node')); tap = module.exports;
    const rate = tap.start(); console.log('capture-probe-start', JSON.stringify({ rate, signature: tap.signature() }));
    let frames = 0, peak = 0, signature = tap.signature();
    const timer = setInterval(() => {
      const current = tap.signature();
      if (current !== signature) { tap.stop(); try { tap.start(); signature = current; console.log('capture-probe-restarted', current); } catch (error) { console.log('capture-probe-waiting', error.message); } }
      const samples = tap.read(); frames += samples.length / 2;
      for (const sample of samples) peak = Math.max(peak, Math.abs(sample));
      console.log('capture-probe', JSON.stringify({ frames, peak, signature: tap.signature() })); peak = 0;
    }, 1000);
    setTimeout(() => { clearInterval(timer); tap.stop(); app.quit(); }, 90000);
  } catch (error) { console.error('capture-probe-error', error.message); setTimeout(() => app.quit(), 3000); }
});
app.on('before-quit', () => tap?.stop());
