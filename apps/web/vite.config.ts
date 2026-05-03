import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';
import { readFileSync } from 'node:fs';

// Single source of truth for the version: the workspace package.json.
// Bumping that one value is enough — Vite inlines it at build time so
// the footer + about screens can show "v1.2.0-rc1" without an HTTP call.
const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf-8')) as {
  version: string;
};

export default defineConfig({
  plugins: [sveltekit()],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': 'http://127.0.0.1:3000',
      '/health': 'http://127.0.0.1:3000',
    },
  },
  test: {
    include: ['src/**/*.{test,spec}.{ts,js}'],
    environment: 'jsdom',
  },
});
