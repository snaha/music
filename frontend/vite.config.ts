import { svelte } from '@sveltejs/vite-plugin-svelte'
import os from 'node:os'
import { defineConfig } from 'vite'

// this machine's LAN address, so a share link made on localhost still opens on a phone
const lanIp = Object.values(os.networkInterfaces()).flat()
  .find((i) => i?.family === 'IPv4' && !i.internal)?.address ?? 'localhost'

// https://vite.dev/config/
export default defineConfig({
  plugins: [svelte()],
  // Syntax baseline; DOM APIs also need capability checks (see frontend/README.md).
  build: { target: ['chrome111', 'firefox114', 'safari16.4'] },
  define: { __LAN_IP__: JSON.stringify(lanIp) },
})
