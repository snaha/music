import { defineConfig, mergeConfig } from 'vitest/config';
import { playwright } from '@vitest/browser-playwright';
import viteConfig from './vite.config.ts';
export default mergeConfig(viteConfig, defineConfig({
  test: {
    include: ['src/**/*.svelte.test.ts'],
    browser: {
      enabled: true,
      provider: playwright(process.env.MUSIC_TEST_BROWSER ? { launchOptions: { executablePath: process.env.MUSIC_TEST_BROWSER } } : {}),
      instances: [{ browser: 'chromium', headless: true }],
    },
  },
}));
