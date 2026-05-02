/**
 * 2FA recovery codes.
 *
 * Codes are 10 per user, format `XXXX-YYYY` over an unambiguous alphabet
 * (letters that look alike — `O`, `0`, `I`, `1`, `L` — are excluded).
 * Each code is hashed with Argon2id before persistence; the plaintext is
 * shown to the user exactly once.
 *
 * Verification is constant-time-ish: we walk every still-active code for
 * the user, hash-compare the candidate against each, and consume the
 * matching row. This trades a few extra Argon2 verifications per login
 * attempt for the absence of a per-row timing oracle.
 */

import { randomBytes, randomInt } from 'node:crypto';
import { hash as argon2Hash, verify as argon2Verify } from '@node-rs/argon2';
import {
  insertMfaRecoveryCodes,
  getActiveMfaRecoveryCodes,
  markMfaRecoveryCodeUsed,
  deleteMfaRecoveryCodes,
  type MfaRecoveryCodeRecord,
} from '../db/sqlite.js';

const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // 31 chars, no O/0/I/1/L
const CODE_COUNT = 10;
const SEGMENT_LEN = 4; // → format XXXX-YYYY

const ARGON2_OPTIONS = {
  memoryCost: 65536,
  timeCost: 3,
  parallelism: 4,
} as const;

/** Generate one human-presentable recovery code, e.g. `H7K3-RP9X`. */
function generateOne(): string {
  const buf = (n: number): string => {
    let out = '';
    for (let i = 0; i < n; i++) out += ALPHABET[randomInt(0, ALPHABET.length)];
    return out;
  };
  return `${buf(SEGMENT_LEN)}-${buf(SEGMENT_LEN)}`;
}

/** Normalise user input for comparison: uppercase, strip whitespace + hyphens. */
function normalise(input: string): string {
  return input.replace(/[\s-]/g, '').toUpperCase();
}

/** Re-format a normalised code back into the canonical `XXXX-YYYY` shape. */
function canonical(normalised: string): string {
  if (normalised.length !== SEGMENT_LEN * 2) return normalised;
  return `${normalised.slice(0, SEGMENT_LEN)}-${normalised.slice(SEGMENT_LEN)}`;
}

/**
 * Mint a fresh set of recovery codes for `userId`. Any previously-issued
 * codes are invalidated. Returns the plaintext codes — caller MUST pass
 * them back to the user exactly once and never log them.
 */
export async function regenerateRecoveryCodes(userId: string): Promise<string[]> {
  deleteMfaRecoveryCodes(userId);

  const codes: string[] = [];
  const records: MfaRecoveryCodeRecord[] = [];
  const now = new Date().toISOString();

  for (let i = 0; i < CODE_COUNT; i++) {
    const code = generateOne();
    codes.push(code);
    const hashed = await argon2Hash(normalise(code), ARGON2_OPTIONS);
    records.push({
      id: randomBytes(12).toString('hex'),
      user_id: userId,
      code_hash: hashed,
      created_at: now,
      used_at: null,
    });
  }

  insertMfaRecoveryCodes(records);
  return codes;
}

/**
 * Try to consume `candidate` against `userId`'s active codes. Returns
 * `true` and marks the matching code used on success; returns `false` if
 * no active code matches.
 */
export async function consumeRecoveryCode(userId: string, candidate: string): Promise<boolean> {
  const normalisedInput = normalise(candidate);
  if (normalisedInput.length !== SEGMENT_LEN * 2) return false;

  const active = getActiveMfaRecoveryCodes(userId);
  let matched: MfaRecoveryCodeRecord | null = null;
  for (const row of active) {
    // We always run the verify, even after a match, so the total time
    // does not leak which row matched.
    try {
      const ok = await argon2Verify(row.code_hash, normalisedInput);
      if (ok && matched === null) matched = row;
    } catch {
      /* malformed hash — skip */
    }
  }
  if (matched === null) return false;
  markMfaRecoveryCodeUsed(matched.id, new Date().toISOString());
  return true;
}

/** Number of still-usable codes for `userId`. */
export function remainingRecoveryCodes(userId: string): number {
  return getActiveMfaRecoveryCodes(userId).length;
}

/** Re-export the canonical formatter for tests / UI fallback. */
export { canonical, normalise };
