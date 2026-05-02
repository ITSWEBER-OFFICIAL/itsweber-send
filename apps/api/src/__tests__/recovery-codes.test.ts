import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  initDb,
  closeDb,
  insertUser,
  countActiveMfaRecoveryCodes,
  getActiveMfaRecoveryCodes,
} from '../db/sqlite.js';
import { regenerateRecoveryCodes, consumeRecoveryCode } from '../utils/recovery-codes.js';

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'itsweber-send-recovery-'));
  initDb(join(tmpDir, 'shares.db'));
  insertUser({
    id: 'user-1',
    email: 'alice@example.com',
    password_hash: 'irrelevant',
    created_at: new Date().toISOString(),
    role: 'user',
    quota_bytes: 5_000_000_000,
  });
});

afterEach(() => {
  closeDb();
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('recovery codes', () => {
  it('regenerate produces 10 codes in canonical XXXX-YYYY format', async () => {
    const codes = await regenerateRecoveryCodes('user-1');
    expect(codes).toHaveLength(10);
    for (const c of codes) {
      expect(c).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    }
    expect(countActiveMfaRecoveryCodes('user-1')).toBe(10);
  });

  it('consumeRecoveryCode marks the matching row used and returns true exactly once', async () => {
    const codes = await regenerateRecoveryCodes('user-1');
    const code = codes[0]!;

    expect(await consumeRecoveryCode('user-1', code)).toBe(true);
    expect(countActiveMfaRecoveryCodes('user-1')).toBe(9);

    // Same code is now consumed; second attempt must fail.
    expect(await consumeRecoveryCode('user-1', code)).toBe(false);
    expect(countActiveMfaRecoveryCodes('user-1')).toBe(9);
  });

  it('accepts user input regardless of hyphenation or case', async () => {
    const codes = await regenerateRecoveryCodes('user-1');
    const code = codes[0]!;
    const noHyphen = code.replace('-', '').toLowerCase();
    expect(await consumeRecoveryCode('user-1', noHyphen)).toBe(true);
  });

  it('rejects codes that do not belong to the user', async () => {
    const codes = await regenerateRecoveryCodes('user-1');
    insertUser({
      id: 'user-2',
      email: 'bob@example.com',
      password_hash: 'irrelevant',
      created_at: new Date().toISOString(),
      role: 'user',
      quota_bytes: 5_000_000_000,
    });
    expect(await consumeRecoveryCode('user-2', codes[0]!)).toBe(false);
    expect(countActiveMfaRecoveryCodes('user-1')).toBe(10);
  });

  it('regenerate invalidates previously issued codes', async () => {
    const first = await regenerateRecoveryCodes('user-1');
    const second = await regenerateRecoveryCodes('user-1');
    expect(countActiveMfaRecoveryCodes('user-1')).toBe(10);
    expect(await consumeRecoveryCode('user-1', first[0]!)).toBe(false);
    expect(await consumeRecoveryCode('user-1', second[0]!)).toBe(true);
  });

  it('rejects malformed input without throwing', async () => {
    await regenerateRecoveryCodes('user-1');
    expect(await consumeRecoveryCode('user-1', '')).toBe(false);
    expect(await consumeRecoveryCode('user-1', 'short')).toBe(false);
    expect(await consumeRecoveryCode('user-1', 'NOT-VALID-CODE-AT-ALL')).toBe(false);
  });

  it('persists codes only as Argon2id hashes (never plaintext)', async () => {
    const codes = await regenerateRecoveryCodes('user-1');
    const rows = getActiveMfaRecoveryCodes('user-1');
    for (const row of rows) {
      expect(row.code_hash.startsWith('$argon2')).toBe(true);
      for (const code of codes) {
        expect(row.code_hash).not.toContain(code);
      }
    }
  });
});
