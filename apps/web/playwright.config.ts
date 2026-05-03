import { defineConfig, devices } from '@playwright/test';
import { mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * Playwright config (Block G).
 *
 * Runs against the production build, not the dev servers. The API in
 * production mode mounts the SvelteKit handler as its notFoundHandler so
 * a single Node process serves both `/api/*` and the UI under `/` — no
 * Vite middleware, no two-port proxy, no `tsx watch`-on-Windows surprises.
 *
 * `turbo run test:e2e` runs `pnpm build` first (see `turbo.json`).
 *
 * Each `pnpm test:e2e` run uses a fresh temp directory for the SQLite DB
 * and the storage root, so previous-run state never leaks in.
 */

const E2E_TMP = join(tmpdir(), `itsweber-send-e2e-${process.pid}-${Date.now()}`);
mkdirSync(E2E_TMP, { recursive: true });
process.on('exit', () => {
  try {
    rmSync(E2E_TMP, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
});

const apiEnv: Record<string, string> = {
  NODE_ENV: 'production',
  PORT: '3000',
  HOST: '127.0.0.1',
  BASE_URL: 'http://127.0.0.1:3000',
  DB_PATH: join(E2E_TMP, 'shares.db'),
  STORAGE_PATH: join(E2E_TMP, 'uploads'),
  // 64 KB chunks so the resumable test runs on small fixtures while still
  // exercising the multi-chunk path.
  CHUNK_SIZE_BYTES: '65536',
  SESSION_EXPIRY_DAYS: '1',
  LOG_LEVEL: 'warn',
  ENABLE_ACCOUNTS: 'true',
  REGISTRATION_ENABLED: 'true',
  STORAGE_BACKEND: 'filesystem',
  RATE_LIMIT_PER_MIN: '600',
};

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list']],

  use: {
    baseURL: 'http://127.0.0.1:3000',
    trace: 'retain-on-failure',
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  webServer: [
    {
      command: 'node apps/api/build/server.js',
      url: 'http://127.0.0.1:3000/health',
      timeout: 120_000,
      reuseExistingServer: false,
      cwd: '../..',
      env: apiEnv,
    },
  ],
});
