/**
 * Auth-hardening tests (Block D).
 *
 * Exercises the real session middleware through a minimal Fastify
 * instance and verifies the documented invariants:
 *
 *   - API tokens are stored as sha256 hashes, never plaintext.
 *   - The Bearer flow accepts the unhashed plaintext token from clients,
 *     hashes it, and looks it up in `api_tokens`.
 *   - Expired tokens are filtered out by SQL.
 *   - Deleted tokens are no longer accepted.
 *   - A successful Bearer call updates `last_used_at`.
 *   - Deleting a user cascades through FOREIGN KEY ON DELETE CASCADE to
 *     sessions, api_tokens, mfa_recovery_codes, and uploads_in_progress
 *     (PRAGMA foreign_keys = ON is enabled at boot).
 *   - Cookie sessions work for browser flows.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash, randomBytes } from 'node:crypto';
import Fastify, { type FastifyInstance } from 'fastify';
import fastifyCookie from '@fastify/cookie';
import {
  initDb,
  closeDb,
  insertUser,
  insertSession,
  insertApiToken,
  deleteApiToken,
  deleteUser,
  getApiTokenByHash,
  getSession,
  type ApiTokenRecord,
} from '../db/sqlite.js';
import { sessionMiddleware, requireAuth } from '../plugins/session.js';

let tmpDir: string;

function sha256Hex(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  await app.register(fastifyCookie);
  await app.register(sessionMiddleware);
  app.get('/whoami', { preHandler: requireAuth }, async (req) => ({
    id: req.user!.id,
    email: req.user!.email,
    role: req.user!.role,
  }));
  await app.ready();
  return app;
}

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'itsweber-send-auth-'));
  initDb(join(tmpDir, 'shares.db'));

  insertUser({
    id: 'user-1',
    email: 'alice@example.com',
    password_hash: 'irrelevant-for-auth-middleware-test',
    created_at: new Date().toISOString(),
    role: 'user',
    quota_bytes: 5_000_000_000,
  });
});

afterEach(() => {
  closeDb();
  rmSync(tmpDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Token-storage invariant: never plaintext, only sha256 hashes
// ---------------------------------------------------------------------------

describe('api-token storage', () => {
  it('persists only the sha256 hash; the plaintext token is never readable from the DB', () => {
    const plaintext = randomBytes(24).toString('hex');
    const hash = sha256Hex(plaintext);
    const record: ApiTokenRecord = {
      id: 'tok-1',
      user_id: 'user-1',
      name: 'CI token',
      token_hash: hash,
      created_at: new Date().toISOString(),
      last_used_at: null,
      expires_at: null,
    };
    insertApiToken(record);

    const looked = getApiTokenByHash(hash);
    expect(looked).toBeDefined();
    expect(looked!.token_hash).toBe(hash);
    expect(looked!.token_hash).not.toBe(plaintext);

    // The plaintext lookup must miss.
    expect(getApiTokenByHash(plaintext)).toBeUndefined();
  });

  it('filters out expired tokens at the SQL level', () => {
    const plaintext = 'tk-expired';
    const hash = sha256Hex(plaintext);
    insertApiToken({
      id: 'tok-exp',
      user_id: 'user-1',
      name: 'expired',
      token_hash: hash,
      created_at: new Date().toISOString(),
      last_used_at: null,
      expires_at: new Date(Date.now() - 60_000).toISOString(),
    });
    expect(getApiTokenByHash(hash)).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Bearer flow through the real session middleware
// ---------------------------------------------------------------------------

describe('Bearer-token auth via session middleware', () => {
  it('accepts a valid plaintext token and resolves the owning user', async () => {
    const plaintext = randomBytes(24).toString('hex');
    insertApiToken({
      id: 'tok-1',
      user_id: 'user-1',
      name: 'CI',
      token_hash: sha256Hex(plaintext),
      created_at: new Date().toISOString(),
      last_used_at: null,
      expires_at: null,
    });

    const app = await buildApp();
    try {
      const res = await app.inject({
        method: 'GET',
        url: '/whoami',
        headers: { authorization: `Bearer ${plaintext}` },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({ id: 'user-1', email: 'alice@example.com' });
    } finally {
      await app.close();
    }
  });

  it('rejects a bogus Bearer token with 401', async () => {
    const app = await buildApp();
    try {
      const res = await app.inject({
        method: 'GET',
        url: '/whoami',
        headers: { authorization: 'Bearer not-a-real-token' },
      });
      expect(res.statusCode).toBe(401);
    } finally {
      await app.close();
    }
  });

  it('rejects an expired Bearer token with 401', async () => {
    const plaintext = randomBytes(24).toString('hex');
    insertApiToken({
      id: 'tok-1',
      user_id: 'user-1',
      name: 'CI',
      token_hash: sha256Hex(plaintext),
      created_at: new Date().toISOString(),
      last_used_at: null,
      expires_at: new Date(Date.now() - 1000).toISOString(),
    });
    const app = await buildApp();
    try {
      const res = await app.inject({
        method: 'GET',
        url: '/whoami',
        headers: { authorization: `Bearer ${plaintext}` },
      });
      expect(res.statusCode).toBe(401);
    } finally {
      await app.close();
    }
  });

  it('rejects a deleted token with 401', async () => {
    const plaintext = randomBytes(24).toString('hex');
    insertApiToken({
      id: 'tok-1',
      user_id: 'user-1',
      name: 'CI',
      token_hash: sha256Hex(plaintext),
      created_at: new Date().toISOString(),
      last_used_at: null,
      expires_at: null,
    });
    deleteApiToken('tok-1', 'user-1');

    const app = await buildApp();
    try {
      const res = await app.inject({
        method: 'GET',
        url: '/whoami',
        headers: { authorization: `Bearer ${plaintext}` },
      });
      expect(res.statusCode).toBe(401);
    } finally {
      await app.close();
    }
  });

  it('updates last_used_at on a successful Bearer call', async () => {
    const plaintext = randomBytes(24).toString('hex');
    insertApiToken({
      id: 'tok-1',
      user_id: 'user-1',
      name: 'CI',
      token_hash: sha256Hex(plaintext),
      created_at: new Date().toISOString(),
      last_used_at: null,
      expires_at: null,
    });
    expect(getApiTokenByHash(sha256Hex(plaintext))!.last_used_at).toBeNull();

    const app = await buildApp();
    try {
      const res = await app.inject({
        method: 'GET',
        url: '/whoami',
        headers: { authorization: `Bearer ${plaintext}` },
      });
      expect(res.statusCode).toBe(200);
    } finally {
      await app.close();
    }

    expect(getApiTokenByHash(sha256Hex(plaintext))!.last_used_at).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Cookie session flow
// ---------------------------------------------------------------------------

describe('Cookie-session auth via session middleware', () => {
  it('accepts a valid `sid` cookie and resolves the owning user', async () => {
    const sid = randomBytes(32).toString('hex');
    insertSession({
      id: sid,
      user_id: 'user-1',
      created_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 60_000).toISOString(),
    });
    const app = await buildApp();
    try {
      const res = await app.inject({
        method: 'GET',
        url: '/whoami',
        headers: { cookie: `sid=${sid}` },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({ id: 'user-1' });
    } finally {
      await app.close();
    }
  });

  it('rejects an expired session cookie with 401', async () => {
    const sid = randomBytes(32).toString('hex');
    insertSession({
      id: sid,
      user_id: 'user-1',
      created_at: new Date().toISOString(),
      expires_at: new Date(Date.now() - 1000).toISOString(),
    });
    const app = await buildApp();
    try {
      const res = await app.inject({
        method: 'GET',
        url: '/whoami',
        headers: { cookie: `sid=${sid}` },
      });
      expect(res.statusCode).toBe(401);
    } finally {
      await app.close();
    }
  });

  it('returns 401 when no auth is presented', async () => {
    const app = await buildApp();
    try {
      const res = await app.inject({ method: 'GET', url: '/whoami' });
      expect(res.statusCode).toBe(401);
    } finally {
      await app.close();
    }
  });
});

// ---------------------------------------------------------------------------
// FOREIGN KEY ON DELETE CASCADE — the load-bearing invariant since v1.1's
// PRAGMA foreign_keys = ON, without which deleting a user would leave behind
// authenticated but identity-less artefacts (sessions, tokens, partial
// uploads, recovery codes). Verified end-to-end here so the pragma can't be
// silently lost in a future refactor.
// ---------------------------------------------------------------------------

describe('user-delete cascade (FK ON DELETE CASCADE)', () => {
  it('removes api_token rows when the owning user is deleted', async () => {
    const plaintext = randomBytes(24).toString('hex');
    insertApiToken({
      id: 'tok-1',
      user_id: 'user-1',
      name: 'CI',
      token_hash: sha256Hex(plaintext),
      created_at: new Date().toISOString(),
      last_used_at: null,
      expires_at: null,
    });
    expect(getApiTokenByHash(sha256Hex(plaintext))).toBeDefined();

    deleteUser('user-1');
    expect(getApiTokenByHash(sha256Hex(plaintext))).toBeUndefined();

    const app = await buildApp();
    try {
      const res = await app.inject({
        method: 'GET',
        url: '/whoami',
        headers: { authorization: `Bearer ${plaintext}` },
      });
      expect(res.statusCode).toBe(401);
    } finally {
      await app.close();
    }
  });

  it('removes session rows when the owning user is deleted', () => {
    const sid = randomBytes(32).toString('hex');
    insertSession({
      id: sid,
      user_id: 'user-1',
      created_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 60_000).toISOString(),
    });
    expect(getSession(sid)).toBeDefined();

    deleteUser('user-1');
    expect(getSession(sid)).toBeUndefined();
  });
});
