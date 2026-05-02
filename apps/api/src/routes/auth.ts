/**
 * Authentication routes: register, login, logout, me.
 *
 * Security:
 * - Passwords hashed with Argon2id, OWASP 2026 defaults.
 * - Sessions: 32-byte random token, HttpOnly + SameSite=Strict cookie.
 * - First registered user receives admin role.
 * - Email lookup is case-insensitive (normalised to lowercase).
 */

import { randomBytes } from 'node:crypto';
import { hash as argon2Hash, verify as argon2Verify } from '@node-rs/argon2';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { config } from '../config.js';
import {
  countUsers,
  getUserByEmail,
  insertSession,
  insertUser,
  deleteSession,
  updateLastLogin,
  insertAuditLog,
} from '../db/sqlite.js';
import { requireAuth } from '../plugins/session.js';
import { verifyTotp } from '../utils/totp.js';
import { consumeRecoveryCode } from '../utils/recovery-codes.js';

// OWASP 2026 Argon2id defaults
const ARGON2_OPTIONS = {
  memoryCost: 65536, // 64 MB
  timeCost: 3,
  parallelism: 4,
} as const;

const COOKIE_NAME = 'sid';

function sessionExpiryDate(): Date {
  return new Date(Date.now() + config.auth.sessionExpiryDays * 24 * 60 * 60 * 1000);
}

function setCookie(reply: import('fastify').FastifyReply, sessionId: string): void {
  const expiresAt = sessionExpiryDate();
  reply.setCookie(COOKIE_NAME, sessionId, {
    httpOnly: true,
    secure: config.env === 'production',
    sameSite: 'strict',
    path: '/',
    expires: expiresAt,
  });
}

function clearCookie(reply: import('fastify').FastifyReply): void {
  reply.clearCookie(COOKIE_NAME, { path: '/' });
}

const RegisterBody = z.object({
  email: z
    .string()
    .email()
    .max(254)
    .transform((e) => e.toLowerCase().trim()),
  password: z.string().min(8).max(128),
});

const LoginBody = z.object({
  email: z
    .string()
    .email()
    .transform((e) => e.toLowerCase().trim()),
  password: z.string().min(1).max(128),
  totpCode: z.string().length(6).optional(),
  // Recovery code is the user-typed alternative to a TOTP code; format
  // `XXXX-YYYY` (8 chars + optional hyphen). Loose `max(32)` bounds the
  // input — the validator inside consumeRecoveryCode does the real
  // shape check.
  recoveryCode: z.string().min(8).max(32).optional(),
});

// Per-route rate limits. Login and register are the prime brute-force targets:
// keep them aggressive. The keys include the IP (default keyGenerator) so a
// single attacker is throttled regardless of which email they iterate over.
const LOGIN_RATE_LIMIT = {
  max: 5,
  timeWindow: '1 minute',
} as const;

const REGISTER_RATE_LIMIT = {
  max: 3,
  timeWindow: '10 minutes',
} as const;

export async function authRoutes(app: FastifyInstance): Promise<void> {
  // POST /api/v1/auth/register
  app.post(
    '/api/v1/auth/register',
    { config: { rateLimit: REGISTER_RATE_LIMIT } },
    async (request, reply) => {
      if (!config.enableAccounts || !config.auth.registrationEnabled) {
        return reply.status(404).send({ error: 'Accounts are disabled' });
      }

      const parsed = RegisterBody.safeParse(request.body);
      if (!parsed.success) {
        return reply
          .status(400)
          .send({ error: 'Invalid request', details: parsed.error.flatten() });
      }
      const { email, password } = parsed.data;

      if (getUserByEmail(email)) {
        return reply.status(409).send({ error: 'Email already registered' });
      }

      const passwordHash = await argon2Hash(password, ARGON2_OPTIONS);
      const id = randomBytes(12).toString('hex');
      const now = new Date().toISOString();
      const isFirstUser = countUsers() === 0;

      insertUser({
        id,
        email,
        password_hash: passwordHash,
        created_at: now,
        role: isFirstUser ? 'admin' : 'user',
        quota_bytes: config.auth.defaultQuotaBytes,
      });

      const sessionId = randomBytes(32).toString('hex');
      const expiresAt = sessionExpiryDate();
      insertSession({
        id: sessionId,
        user_id: id,
        created_at: now,
        expires_at: expiresAt.toISOString(),
      });
      setCookie(reply, sessionId);

      insertAuditLog({
        user_id: id,
        action: 'user.register',
        resource: null,
        ip: request.ip,
        created_at: now,
      });
      app.log.info({ userId: id, email, role: isFirstUser ? 'admin' : 'user' }, 'user registered');
      return reply.status(201).send({ id, email, role: isFirstUser ? 'admin' : 'user' });
    },
  );

  // POST /api/v1/auth/login
  app.post(
    '/api/v1/auth/login',
    { config: { rateLimit: LOGIN_RATE_LIMIT } },
    async (request, reply) => {
      if (!config.enableAccounts) {
        return reply.status(404).send({ error: 'Accounts are disabled' });
      }

      const parsed = LoginBody.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: 'Invalid request' });
      }
      const { email, password, totpCode, recoveryCode } = parsed.data;

      const user = getUserByEmail(email);
      if (!user) {
        // Constant-time: run hash anyway to prevent timing attacks
        await argon2Hash('__placeholder__', ARGON2_OPTIONS);
        return reply.status(401).send({ error: 'Invalid email or password' });
      }

      const valid = await argon2Verify(user.password_hash, password);
      if (!valid) {
        return reply.status(401).send({ error: 'Invalid email or password' });
      }

      // 2FA check: accept either a fresh TOTP code or a one-shot
      // recovery code. Recovery codes are consumed on success.
      if (user.totp_enabled === 1 && user.totp_secret) {
        if (!totpCode && !recoveryCode) {
          return reply.status(202).send({ requires2FA: true });
        }
        let secondFactorOk = false;
        if (totpCode && verifyTotp(user.totp_secret, totpCode)) {
          secondFactorOk = true;
        } else if (recoveryCode) {
          secondFactorOk = await consumeRecoveryCode(user.id, recoveryCode);
          if (secondFactorOk) {
            insertAuditLog({
              user_id: user.id,
              action: '2fa.recovery_code_used',
              resource: null,
              ip: request.ip,
              created_at: new Date().toISOString(),
            });
          } else {
            insertAuditLog({
              user_id: user.id,
              action: '2fa.recovery_code_failed',
              resource: null,
              ip: request.ip,
              created_at: new Date().toISOString(),
            });
          }
        }
        if (!secondFactorOk) {
          return reply.status(401).send({ error: 'Invalid authenticator or recovery code' });
        }
      }

      const now = new Date().toISOString();
      updateLastLogin(user.id, now);
      insertAuditLog({
        user_id: user.id,
        action: 'user.login',
        resource: null,
        ip: request.ip,
        created_at: now,
      });

      const sessionId = randomBytes(32).toString('hex');
      const expiresAt = sessionExpiryDate();
      insertSession({
        id: sessionId,
        user_id: user.id,
        created_at: now,
        expires_at: expiresAt.toISOString(),
      });
      setCookie(reply, sessionId);

      app.log.info({ userId: user.id }, 'user logged in');
      return reply.send({ id: user.id, email: user.email, role: user.role });
    },
  );

  // POST /api/v1/auth/logout
  app.post('/api/v1/auth/logout', { preHandler: requireAuth }, async (request, reply) => {
    const sid = request.cookies?.sid;
    if (sid) deleteSession(sid);
    insertAuditLog({
      user_id: request.user!.id,
      action: 'user.logout',
      resource: null,
      ip: request.ip,
      created_at: new Date().toISOString(),
    });
    clearCookie(reply);
    return reply.send({ ok: true });
  });

  // GET /api/v1/auth/me
  app.get('/api/v1/auth/me', async (request, reply) => {
    if (!request.user) {
      return reply.status(401).send({ error: 'Not authenticated' });
    }
    return reply.send({
      id: request.user.id,
      email: request.user.email,
      role: request.user.role,
      quotaBytes: request.user.quotaBytes,
    });
  });
}
