import path from 'node:path';

const entitlements = path.resolve(import.meta.dirname, '../build/entitlements.navidrome.mac.plist');

export function signingOptions(options) {
  const server = path.join(options.app, 'Contents/Resources/navidrome');
  return {
    ...options,
    optionsForFile(file) {
      const inherited = options.optionsForFile?.(file) || {};
      // Navidrome's WASM runtime creates executable memory without MAP_JIT.
      // Apply that entitlement only to the server; retain Electron's own options.
      return file === server ? { ...inherited, entitlements } : inherited;
    },
  };
}

export default async function sign(options) {
  const { signAsync } = await import('@electron/osx-sign');
  await signAsync(signingOptions(options));
}
