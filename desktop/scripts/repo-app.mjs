import { cp, mkdir, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
// Resolve the installed official Electron distribution without loading its CommonJS entry point.
const root = path.resolve(import.meta.dirname, '..');
const electronRoot = path.dirname(new URL(import.meta.resolve('electron/package.json')).pathname);
const target = path.join(root, '.local-app', 'Music.app');
await mkdir(path.dirname(target), { recursive: true });
await cp(path.join(electronRoot, 'dist/Electron.app'), target, { recursive: true, force: true, verbatimSymlinks: true });
const resources = path.join(target, 'Contents/Resources');
await mkdir(path.join(resources, 'app'), { recursive: true });
const probe = process.argv.includes('--probe');
await writeFile(path.join(resources, 'app/package.json'), JSON.stringify({ name: 'Music', productName: 'Music', version: '0.5.0', type: 'module', main: 'entry.js' }));
await writeFile(path.join(resources, 'app/entry.js'), `import ${JSON.stringify(path.join(root, probe ? 'capture-probe.js' : 'main.js'))};\n`);
await cp(path.join(root, 'bin/navidrome'), path.join(resources, 'navidrome'));
const plist = path.join(target, 'Contents/Info.plist');
for (const [key, value] of Object.entries({ CFBundleIdentifier: 'dev.musicapp.desktop', CFBundleName: 'Music', CFBundleDisplayName: 'Music', NSAudioCaptureUsageDescription: 'Music uses Spotify audio on this Mac to animate your visualizer. Audio is never saved or uploaded.' })) {
  try { execFileSync('/usr/libexec/PlistBuddy', ['-c', `Set :${key} ${value}`, plist], { stdio: 'ignore' }); }
  catch { execFileSync('/usr/libexec/PlistBuddy', ['-c', `Add :${key} string ${value}`, plist]); }
}
execFileSync('codesign', ['--force', '--deep', '--sign', '-', target], { stdio: 'inherit' });
console.log(target);
