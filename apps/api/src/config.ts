/**
 * Centralized configuration. Read once at boot from environment variables.
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
    s3: {
      bucket: str('S3_BUCKET', ''),
      endpoint: str('S3_ENDPOINT', ''),
      region: str('S3_REGION', 'us-east-1'),
      forcePathStyle: bool('S3_FORCE_PATH_STYLE', false),
    },
  },
  db: {
    path: str('DB_PATH', './data/shares.db'),
  },
  auth: {
    sessionExpiryDays: num('SESSION_EXPIRY_DAYS', 30),
    registrationEnabled: bool('REGISTRATION_ENABLED', true),
    defaultQuotaBytes: num('DEFAULT_QUOTA_BYTES', 5 * 1024 * 1024 * 1024),
  },
  uploads: {
    // v1.1 resumable upload settings. See docs/V1.1_DECISIONS.md for the
    // chunk-size rationale and the per-layer ceilings (Caddy, S3, browser).
    chunkSizeBytes: num('CHUNK_SIZE_BYTES', 16 * 1024 * 1024), // 16 MiB plaintext per chunk
    // Hard server-side ceiling per blob (one file). 100 GB by default; tune
    // upward only after raising Caddy's request_body and, on S3, the chunk
    // size (to stay under the 10000 multipart-parts limit).
    maxBlobBytes: num('MAX_BLOB_BYTES', 100 * 1024 * 1024 * 1024),
    // Lifetime of a pending resumable upload before the cleanup job removes
    // it and frees the partial blobs. Resume across browser restarts MUST
    // happen within this window.
    resumeWindowHours: num('UPLOAD_RESUME_HOURS', 24),
  },
  webhook: {
    url: str('WEBHOOK_URL', ''),
    secret: str('WEBHOOK_SECRET', ''),
  },
  logLevel: str('LOG_LEVEL', 'info') as 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace',
} as const;

export type Config = typeof config;
