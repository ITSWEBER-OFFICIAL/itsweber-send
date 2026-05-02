/**
 * Centralized configuration. Read once at boot from environment variables.
 * The schema is intentionally narrow at this stage — extended in M2 / M5.
 */

function num(name: string, fallback: number): number {
  const v = process.env[name];
  if (v === undefined || v === '') return fallback;
  const n = Number(v);
  if (!Number.isFinite(n)) {
    throw new Error(`Environment variable ${name} must be a number, got "${v}"`);
  }
  return n;
}

function str(name: string, fallback: string): string {
  const v = process.env[name];
  return v === undefined || v === '' ? fallback : v;
}

function bool(name: string, fallback: boolean): boolean {
  const v = process.env[name];
  if (v === undefined || v === '') return fallback;
  return v === 'true' || v === '1' || v === 'yes';
}

export const config = {
  env: str('NODE_ENV', 'development') as 'development' | 'production' | 'test',
  host: str('HOST', '127.0.0.1'),
  port: num('PORT', 3000),
  baseUrl: str('BASE_URL', 'http://localhost:3000'),
  rateLimitPerMin: num('RATE_LIMIT_PER_MIN', 60),
  enableAccounts: bool('ENABLE_ACCOUNTS', true),
  storage: {
    backend: str('STORAGE_BACKEND', 'filesystem') as 'filesystem' | 's3',
    path: str('STORAGE_PATH', './data/uploads'),
  },
  db: {
    path: str('DB_PATH', './data/shares.db'),
  },
  auth: {
    sessionExpiryDays: num('SESSION_EXPIRY_DAYS', 30),
    registrationEnabled: bool('REGISTRATION_ENABLED', true),
    defaultQuotaBytes: num('DEFAULT_QUOTA_BYTES', 5 * 1024 * 1024 * 1024),
  },
  logLevel: str('LOG_LEVEL', 'info') as 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace',
} as const;

export type Config = typeof config;
