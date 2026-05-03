/**
 * Runtime-settings tests (Block E).
 *
 * Verifies that admin-tunable values in `system_settings` are read on
 * every call (no stale cache), that env defaults still apply when the
 * setting is unset, and that the env-derived hard ceiling for
 * `MAX_BLOB_BYTES` cannot be exceeded by an admin override.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { initDb, closeDb, setSetting } from '../db/sqlite.js';
import { config } from '../config.js';
import {
  effectiveDefaultQuotaBytes,
  effectiveMaxBlobBytes,
  effectiveMaxExpiryHours,
  isRegistrationEnabled,
  effectiveLimits,
} from '../runtime-settings.js';

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'itsweber-send-runtime-'));
  initDb(join(tmpDir, 'shares.db'));
});

afterEach(() => {
  closeDb();
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('isRegistrationEnabled', () => {
  it('falls back to the env default when no admin setting is stored', () => {
    expect(isRegistrationEnabled()).toBe(config.auth.registrationEnabled);
  });

  it('returns false when the admin setting is `false`', () => {
    setSetting('registration_enabled', 'false');
    expect(isRegistrationEnabled()).toBe(false);
  });

  it('returns true when the admin setting is `true`', () => {
    setSetting('registration_enabled', 'true');
    expect(isRegistrationEnabled()).toBe(true);
  });

  it('reads the latest value (no stale cache between calls)', () => {
    setSetting('registration_enabled', 'true');
    expect(isRegistrationEnabled()).toBe(true);
    setSetting('registration_enabled', 'false');
    expect(isRegistrationEnabled()).toBe(false);
    setSetting('registration_enabled', 'true');
    expect(isRegistrationEnabled()).toBe(true);
  });
});

describe('effectiveDefaultQuotaBytes', () => {
  it('falls back to the env default when unset', () => {
    expect(effectiveDefaultQuotaBytes()).toBe(config.auth.defaultQuotaBytes);
  });

  it('honours the admin override', () => {
    setSetting('default_quota_bytes', String(123_456_789));
    expect(effectiveDefaultQuotaBytes()).toBe(123_456_789);
  });

  it('rejects non-integer or negative values, falling back to env', () => {
    setSetting('default_quota_bytes', 'not-a-number');
    expect(effectiveDefaultQuotaBytes()).toBe(config.auth.defaultQuotaBytes);
    setSetting('default_quota_bytes', '-100');
    expect(effectiveDefaultQuotaBytes()).toBe(config.auth.defaultQuotaBytes);
  });
});

describe('effectiveMaxBlobBytes', () => {
  it('falls back to env MAX_BLOB_BYTES when unset', () => {
    expect(effectiveMaxBlobBytes()).toBe(config.uploads.maxBlobBytes);
  });

  it('admin can lower the ceiling below the env value', () => {
    const lower = Math.floor(config.uploads.maxBlobBytes / 2);
    setSetting('max_upload_size_bytes', String(lower));
    expect(effectiveMaxBlobBytes()).toBe(lower);
  });

  it('admin cannot raise the ceiling past the env value (env is the hard cap)', () => {
    const tooHigh = config.uploads.maxBlobBytes * 10;
    setSetting('max_upload_size_bytes', String(tooHigh));
    expect(effectiveMaxBlobBytes()).toBe(config.uploads.maxBlobBytes);
  });
});

describe('effectiveMaxExpiryHours', () => {
  it('returns 168 when unset (1.0 default cap)', () => {
    expect(effectiveMaxExpiryHours()).toBe(168);
  });

  it('honours the admin override', () => {
    setSetting('max_expiry_hours', '24');
    expect(effectiveMaxExpiryHours()).toBe(24);
  });

  it('rejects zero / negative / non-integer values, falling back to default', () => {
    setSetting('max_expiry_hours', '0');
    expect(effectiveMaxExpiryHours()).toBe(168);
    setSetting('max_expiry_hours', '-1');
    expect(effectiveMaxExpiryHours()).toBe(168);
    setSetting('max_expiry_hours', 'abc');
    expect(effectiveMaxExpiryHours()).toBe(168);
  });
});

describe('effectiveLimits snapshot', () => {
  it('returns the resolved values for all four tunables in one call', () => {
    setSetting('registration_enabled', 'false');
    setSetting('default_quota_bytes', '1000');
    setSetting('max_upload_size_bytes', '2000');
    setSetting('max_expiry_hours', '24');

    const snapshot = effectiveLimits();
    expect(snapshot.registrationEnabled).toBe(false);
    expect(snapshot.defaultQuotaBytes).toBe(1000);
    expect(snapshot.maxBlobBytes).toBe(2000); // 2000 < env hard cap
    expect(snapshot.maxExpiryHours).toBe(24);
  });
});
