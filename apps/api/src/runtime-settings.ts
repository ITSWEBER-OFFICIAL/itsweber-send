/**
 * Runtime-effective settings (Block E).
 *
 * The admin panel persists tunables in the `system_settings` table so a
 * fresh container can be reconfigured without an env-restart. Static
 * `config` values from `config.ts` remain the authoritative startup
 * defaults and the hard backstop for security-critical limits.
 *
 * The helpers below resolve the effective value at every call rather
 * than at boot. SQLite reads are sub-microsecond on the embedded engine
 * so per-request lookups are not a bottleneck; this avoids stale-cache
 * bugs (admin lowers a quota → next request must see it).
 *
 * Backstop semantics: env-derived values continue to act as the
 * non-overridable upper bound for security-relevant limits. An admin
 * can lower `max_upload_size_bytes` below `MAX_BLOB_BYTES` at runtime
 * but cannot raise it past the env value, since the env value also
 * gates the S3 multipart sanity checks at boot and the body-limit
 * configuration on the chunk PATCH route.
 */

import { config } from './config.js';
import { getSetting } from './db/sqlite.js';

const KEY_REGISTRATION_ENABLED = 'registration_enabled';
const KEY_DEFAULT_QUOTA_BYTES = 'default_quota_bytes';
const KEY_MAX_UPLOAD_SIZE_BYTES = 'max_upload_size_bytes';
const KEY_MAX_EXPIRY_HOURS = 'max_expiry_hours';

function readBool(key: string, fallback: boolean): boolean {
  const v = getSetting(key);
  if (v === undefined) return fallback;
  return v === 'true' || v === '1' || v === 'yes';
}

function readNonNegativeInt(key: string, fallback: number): number {
  const v = getSetting(key);
  if (v === undefined) return fallback;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) return fallback;
  return n;
}

function readPositiveInt(key: string, fallback: number): number {
  const v = getSetting(key);
  if (v === undefined) return fallback;
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0 || !Number.isInteger(n)) return fallback;
  return n;
}

/**
 * Whether self-service registration is currently allowed. The admin
 * setting takes precedence; if unset, falls back to the env value
 * `REGISTRATION_ENABLED`. `enableAccounts === false` is an even harder
 * kill-switch that this helper does NOT consult — callers must AND
 * with `config.enableAccounts` if they want both checks.
 */
export function isRegistrationEnabled(): boolean {
  return readBool(KEY_REGISTRATION_ENABLED, config.auth.registrationEnabled);
}

/**
 * Quota in bytes assigned to a freshly-registered user. Admin override
 * takes precedence over `DEFAULT_QUOTA_BYTES`.
 */
export function effectiveDefaultQuotaBytes(): number {
  return readNonNegativeInt(KEY_DEFAULT_QUOTA_BYTES, config.auth.defaultQuotaBytes);
}

/**
 * Server-enforced ceiling on the ciphertext size of a single blob (one
 * file). Returns `min(env.MAX_BLOB_BYTES, admin_setting_or_env)`. The
 * env value is the non-overridable upper bound — admin can lower it at
 * runtime but never raise it past the value baked into the chunk-size
 * sanity checks at boot.
 *
 * Note for operators: changing this at runtime applies to NEW uploads
 * only. In-progress uploads continue under the size they were created
 * with (`POST /api/v1/uploads` returns the maxBlobBytes that was in
 * effect at create-time and the client commits to that value).
 */
export function effectiveMaxBlobBytes(): number {
  const envCap = config.uploads.maxBlobBytes;
  const adminValue = readNonNegativeInt(KEY_MAX_UPLOAD_SIZE_BYTES, envCap);
  return Math.min(envCap, adminValue);
}

/**
 * Cap on the `expiryHours` value a sender can pick on a new share.
 * Admin override takes precedence; if unset, falls back to the largest
 * preset (`168` hours, i.e. 7 days, matching the v1.0 default).
 *
 * Validated server-side after the zod parse in the upload routes — the
 * shared schema only checks that the value is one of the allowed
 * presets, not that it stays under the admin cap.
 */
export function effectiveMaxExpiryHours(): number {
  return readPositiveInt(KEY_MAX_EXPIRY_HOURS, 168);
}

/**
 * Snapshot used by `GET /api/v1/limits` and the admin GET. Convenient
 * to avoid four separate DB reads when serializing.
 */
export function effectiveLimits(): {
  registrationEnabled: boolean;
  defaultQuotaBytes: number;
  maxBlobBytes: number;
  maxExpiryHours: number;
} {
  return {
    registrationEnabled: isRegistrationEnabled(),
    defaultQuotaBytes: effectiveDefaultQuotaBytes(),
    maxBlobBytes: effectiveMaxBlobBytes(),
    maxExpiryHours: effectiveMaxExpiryHours(),
  };
}
