/** Project-wide constants used by both web and api. */

export const APP_NAME = 'ITSWEBER Send' as const;

/** Default upload limits (overridable via environment). */
export const LIMITS = {
  /** Maximum file size in bytes for a single file (5 GB). */
  maxFileBytes: 5 * 1024 * 1024 * 1024,
  /** Maximum number of files in a single share. */
  maxFilesPerShare: 100,
  /** Allowed expiry presets in hours. */
  expiryPresetsHours: [1, 24, 24 * 7, 24 * 30] as const,
  /** Allowed download-limit presets. `0` means unlimited. */
  downloadLimitPresets: [1, 5, 20, 0] as const,
} as const;

/** Crypto parameters (full details: packages/crypto-spec). */
export const CRYPTO = {
  algorithm: 'AES-GCM' as const,
  keyLengthBits: 256,
  ivLengthBytes: 12,
  pbkdf2Iterations: 200_000,
  pbkdf2Hash: 'SHA-256' as const,
  saltLengthBytes: 16,
} as const;

/** Routes used by both client and server. */
export const ROUTES = {
  upload: '/api/v1/upload',
  download: '/api/v1/download',
  health: '/health',
  metrics: '/metrics',
} as const;
