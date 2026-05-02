import { randomBytes, createHash } from 'node:crypto';
import { hash as argon2Hash, verify as argon2Verify } from '@node-rs/argon2';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  getSharesByUser,
  getUserQuotaUsed,
  getUserById,
  deleteShare,
  getApiTokensByUser,
  insertApiToken,
  deleteApiToken,
  getAuditLogByUser,
  countAuditLogByUser,
  updateUserProfile,
  updateUserPassword,
  updateUserNotifications,
  setUserTotp,
  getUserByEmail,
  insertAuditLog,
  deleteMfaRecoveryCodes,
} from '../db/sqlite.js';
import { requireAuth } from '../plugins/session.js';
import type { StorageAdapter } from '../storage/interface.js';
import { generateTotpSecret, getTotpUri, verifyTotp } from '../utils/totp.js';
import { regenerateRecoveryCodes, remainingRecoveryCodes } from '../utils/recovery-codes.js';

const ARGON2_OPTIONS = { memoryCost: 65536, timeCost: 3, parallelism: 4 } as const;

function sha256Hex(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function createAccountRoutes(storage: StorageAdapter) {
  return async function accountPlugin(app: FastifyInstance): Promise<void> {
    // ------------------------------------------------------------------ uploads

    app.get('/api/v1/account/uploads', { preHandler: requireAuth }, async (request, reply) => {
      const user = request.user!;
      const shares = getSharesByUser(user.id);
      const quotaUsed = getUserQuotaUsed(user.id);
      const now = new Date();

      return reply.send({
        uploads: shares.map((s) => ({
          id: s.id,
          wordcode: s.wordcode,
          createdAt: s.created_at,
          expiresAt: s.expires_at,
          expired: new Date(s.expires_at) < now,
          downloadLimit: s.download_limit,
          downloadsUsed: s.downloads_used,
          totalSizeBytes: s.total_size_bytes,
          passwordProtected: s.salt !== null,
        })),
        quota: {
          totalBytes: user.quotaBytes,
          usedBytes: quotaUsed,
          remainingBytes: Math.max(0, user.quotaBytes - quotaUsed),
        },
      });
    });

    app.delete<{ Params: { id: string } }>(
      '/api/v1/account/uploads/:id',
      { preHandler: requireAuth },
      async (request, reply) => {
        const user = request.user!;
        const shares = getSharesByUser(user.id);
        const share = shares.find((s) => s.id === request.params.id);

        if (!share) return reply.status(404).send({ error: 'Upload not found' });

        try {
          await storage.delete(share.id);
        } catch {
          /* already gone */
        }
        deleteShare(share.id);
        insertAuditLog({
          user_id: user.id,
          action: 'share.deleted',
          resource: share.id,
          ip: request.ip,
          created_at: new Date().toISOString(),
        });

        return reply.send({ ok: true });
      },
    );

    // ------------------------------------------------------------------ profile

    app.get('/api/v1/account/profile', { preHandler: requireAuth }, async (request, reply) => {
      const user = request.user!;
      const full = getUserById(user.id);
      return reply.send({
        id: user.id,
        email: user.email,
        displayName: full?.display_name ?? null,
        role: user.role,
        createdAt: full?.created_at ?? null,
      });
    });

    const UpdateProfileBody = z.object({
      email: z
        .string()
        .email()
        .max(254)
        .transform((e) => e.toLowerCase().trim())
        .optional(),
      displayName: z.string().max(100).nullable().optional(),
    });

    app.patch('/api/v1/account/profile', { preHandler: requireAuth }, async (request, reply) => {
      const user = request.user!;
      const parsed = UpdateProfileBody.safeParse(request.body);
      if (!parsed.success)
        return reply
          .status(400)
          .send({ error: 'Invalid request', details: parsed.error.flatten() });

      const { email, displayName } = parsed.data;
      if (email && email !== user.email && getUserByEmail(email)) {
        return reply.status(409).send({ error: 'Email already in use' });
      }

      const fields: { email?: string; display_name?: string | null } = {};
      if (email !== undefined) fields.email = email;
      if (displayName !== undefined) fields.display_name = displayName;
      if (Object.keys(fields).length > 0) updateUserProfile(user.id, fields);

      insertAuditLog({
        user_id: user.id,
        action: 'profile.updated',
        resource: null,
        ip: request.ip,
        created_at: new Date().toISOString(),
      });
      return reply.send({ ok: true });
    });

    // ------------------------------------------------------------------ security

    app.get('/api/v1/account/security', { preHandler: requireAuth }, async (request, reply) => {
      const full = getUserById(request.user!.id);
      return reply.send({ totpEnabled: full?.totp_enabled === 1 });
    });

    const ChangePasswordBody = z.object({
      currentPassword: z.string().min(1).max(128),
      newPassword: z.string().min(8).max(128),
    });

    app.post(
      '/api/v1/account/security/change-password',
      { preHandler: requireAuth },
      async (request, reply) => {
        const user = getUserById(request.user!.id);
        if (!user) return reply.status(404).send({ error: 'User not found' });

        const parsed = ChangePasswordBody.safeParse(request.body);
        if (!parsed.success) return reply.status(400).send({ error: 'Invalid request' });

        const valid = await argon2Verify(user.password_hash, parsed.data.currentPassword);
        if (!valid) return reply.status(401).send({ error: 'Current password is incorrect' });

        const newHash = await argon2Hash(parsed.data.newPassword, ARGON2_OPTIONS);
        updateUserPassword(user.id, newHash);
        insertAuditLog({
          user_id: user.id,
          action: 'password.changed',
          resource: null,
          ip: request.ip,
          created_at: new Date().toISOString(),
        });

        return reply.send({ ok: true });
      },
    );

    app.post(
      '/api/v1/account/security/2fa/setup',
      { preHandler: requireAuth },
      async (request, reply) => {
        const user = getUserById(request.user!.id);
        if (!user) return reply.status(404).send({ error: 'User not found' });

        const secret = generateTotpSecret();
        setUserTotp(user.id, secret, false);
        const uri = getTotpUri(secret, user.email);

        return reply.send({ secret, uri });
      },
    );

    const Verify2FABody = z.object({ code: z.string().length(6) });

    app.post(
      '/api/v1/account/security/2fa/verify',
      { preHandler: requireAuth },
      async (request, reply) => {
        const user = getUserById(request.user!.id);
        if (!user?.totp_secret) return reply.status(400).send({ error: '2FA setup not started' });

        const parsed = Verify2FABody.safeParse(request.body);
        if (!parsed.success) return reply.status(400).send({ error: 'Invalid code format' });

        if (!verifyTotp(user.totp_secret, parsed.data.code)) {
          return reply.status(401).send({ error: 'Invalid code' });
        }

        setUserTotp(user.id, user.totp_secret, true);
        insertAuditLog({
          user_id: user.id,
          action: '2fa.enabled',
          resource: null,
          ip: request.ip,
          created_at: new Date().toISOString(),
        });

        return reply.send({ ok: true });
      },
    );

    app.delete(
      '/api/v1/account/security/2fa',
      { preHandler: requireAuth },
      async (request, reply) => {
        setUserTotp(request.user!.id, null, false);
        // Disabling 2FA also invalidates the recovery codes — they only
        // exist as a 2FA escape hatch.
        deleteMfaRecoveryCodes(request.user!.id);
        insertAuditLog({
          user_id: request.user!.id,
          action: '2fa.disabled',
          resource: null,
          ip: request.ip,
          created_at: new Date().toISOString(),
        });
        return reply.send({ ok: true });
      },
    );

    // -------------------------------------------------------- recovery codes

    /**
     * Generate a fresh set of 10 single-use recovery codes. Any
     * previously-issued codes are invalidated. Plaintext codes are
     * returned exactly once — the server only persists Argon2id hashes.
     */
    app.post(
      '/api/v1/account/security/2fa/recovery-codes',
      { preHandler: requireAuth },
      async (request, reply) => {
        const user = getUserById(request.user!.id);
        if (!user || user.totp_enabled !== 1) {
          return reply.status(400).send({ error: 'Enable 2FA before generating recovery codes' });
        }
        const codes = await regenerateRecoveryCodes(user.id);
        insertAuditLog({
          user_id: user.id,
          action: '2fa.recovery_codes_generated',
          resource: null,
          ip: request.ip,
          created_at: new Date().toISOString(),
        });
        return reply.send({ codes, remaining: codes.length });
      },
    );

    /** Return the count of still-usable recovery codes (no plaintext). */
    app.get(
      '/api/v1/account/security/2fa/recovery-codes',
      { preHandler: requireAuth },
      async (request, reply) => {
        const remaining = remainingRecoveryCodes(request.user!.id);
        return reply.send({ remaining });
      },
    );

    // ------------------------------------------------------------------ notifications

    app.get(
      '/api/v1/account/notifications',
      { preHandler: requireAuth },
      async (request, reply) => {
        const user = getUserById(request.user!.id);
        return reply.send({
          emailOnDownload: user?.email_on_download === 1,
          emailOnExpiry: user?.email_on_expiry === 1,
        });
      },
    );

    const UpdateNotificationsBody = z.object({
      emailOnDownload: z.boolean(),
      emailOnExpiry: z.boolean(),
    });

    app.patch(
      '/api/v1/account/notifications',
      { preHandler: requireAuth },
      async (request, reply) => {
        const parsed = UpdateNotificationsBody.safeParse(request.body);
        if (!parsed.success) return reply.status(400).send({ error: 'Invalid request' });

        updateUserNotifications(
          request.user!.id,
          parsed.data.emailOnDownload,
          parsed.data.emailOnExpiry,
        );
        return reply.send({ ok: true });
      },
    );

    // ------------------------------------------------------------------ API tokens

    app.get('/api/v1/account/tokens', { preHandler: requireAuth }, async (request, reply) => {
      const tokens = getApiTokensByUser(request.user!.id);
      return reply.send(
        tokens.map((t) => ({
          id: t.id,
          name: t.name,
          createdAt: t.created_at,
          lastUsedAt: t.last_used_at,
          expiresAt: t.expires_at,
        })),
      );
    });

    const CreateTokenBody = z.object({
      name: z.string().min(1).max(100),
      expiresAt: z.string().datetime().nullable().optional(),
    });

    app.post('/api/v1/account/tokens', { preHandler: requireAuth }, async (request, reply) => {
      const parsed = CreateTokenBody.safeParse(request.body);
      if (!parsed.success) return reply.status(400).send({ error: 'Invalid request' });

      const rawToken = randomBytes(32).toString('hex');
      const tokenHash = sha256Hex(rawToken);
      const id = randomBytes(12).toString('hex');
      const now = new Date().toISOString();

      insertApiToken({
        id,
        user_id: request.user!.id,
        name: parsed.data.name,
        token_hash: tokenHash,
        created_at: now,
        last_used_at: null,
        expires_at: parsed.data.expiresAt ?? null,
      });

      insertAuditLog({
        user_id: request.user!.id,
        action: 'token.created',
        resource: id,
        ip: request.ip,
        created_at: now,
      });

      return reply.status(201).send({
        id,
        token: rawToken,
        name: parsed.data.name,
        createdAt: now,
        expiresAt: parsed.data.expiresAt ?? null,
      });
    });

    app.delete<{ Params: { id: string } }>(
      '/api/v1/account/tokens/:id',
      { preHandler: requireAuth },
      async (request, reply) => {
        deleteApiToken(request.params.id, request.user!.id);
        insertAuditLog({
          user_id: request.user!.id,
          action: 'token.deleted',
          resource: request.params.id,
          ip: request.ip,
          created_at: new Date().toISOString(),
        });
        return reply.send({ ok: true });
      },
    );

    // ------------------------------------------------------------------ audit log

    app.get('/api/v1/account/audit', { preHandler: requireAuth }, async (request, reply) => {
      const query = request.query as { limit?: string; offset?: string };
      const limit = Math.min(Number(query.limit ?? 50), 200);
      const offset = Number(query.offset ?? 0);
      const userId = request.user!.id;

      return reply.send({
        total: countAuditLogByUser(userId),
        entries: getAuditLogByUser(userId, limit, offset),
      });
    });
  };
}
