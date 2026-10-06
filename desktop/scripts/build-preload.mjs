import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';

// Electron's sandboxed preload uses a CommonJS runtime; author the bridge as ESM.
await build({
  entryPoints: [fileURLToPath(new URL('../preload.js', import.meta.url))],
  outfile: fileURLToPath(new URL('../preload.bundle.cjs', import.meta.url)),
  bundle: true, platform: 'node', format: 'cjs', external: ['electron'], target: 'node22',
});
