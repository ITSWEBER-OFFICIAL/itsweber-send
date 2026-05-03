import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  getStats,
  listUsers,
  listAllShares,
  countShares,
  countUsers,
  deleteShare,
  deleteUser,
  deleteUserSessions,
  getSharesByUser,
  updateUserQuota,
  updateUserRole,
  getAuditLogAll,
  countAuditLogAll,
  getSetting,
  setSetting,
  getAllSettings,
  insertAuditLog,
} from '../db/sqlite.js';
import { requireAdmin } from '../plugins/session.js';
import type { StorageAdapter } from '../storage/interface.js';
import { verifyAndSendTest } from '../utils/mailer.js';

const DEFAULT_SETTINGS: Record<string, string> = {
  registration_enabled: 'true',
  default_quota_bytes: String(5 * 1024 * 1024 * 1024),
  max_upload_size_bytes: String(5 * 1024 * 1024 * 1024),
  max_expiry_hours: '168',
};

function getEffectiveSetting(key: string): string {
  return getSetting(key) ?? DEFAULT_SETTINGS[key] ?? '';
}

export function createAdminRoutes(storage: StorageAdapter) {
  return async function adminPlugin(app: FastifyInstance): Promise<void> {
    // ------------------------------------------------------------------ stats

    app.get('/api/v1/admin/stats', { preHandler: requireAdmin }, async (_request, reply) => {
      return reply.send(getStats());
    });

    // ------------------------------------------------------------------ users

    app.get('/api/v1/admin/users', { preHandler: requireAdmin }, async (request, reply) => {
      const query = request.query as { limit?: string; offset?: string };
      const limit = Math.min(Number(query.limit ?? 50), 200);
      const offset = Number(query.offset ?? 0);

      return reply.send({
        total: countUsers(),
        users: listUsers(limit, offset).map((u) => ({
          id: u.id,
          email: u.email,
          displayName: u.display_name,
          role: u.role,
          createdAt: u.created_at,
          lastLoginAt: u.last_login_at,
          quotaBytes: u.quota_bytes,
          totpEnabled: u.totp_enabled === 1,
        })),
      });
    });

    const UpdateUserBody = z.object({
      role: z.enum(['user', 'admin']).optional(),
      quotaBytes: z.number().int().min(0).optional(),
    });

    app.patch<{ Params: { id: string } }>(
      '/api/v1/admin/users/:id',
      { preHandler: requireAdmin },
      async (request, reply) => {
        const parsed = UpdateUserBody.safeParse(request.body);
        if (!parsed.success) return reply.status(400).send({ error: 'Invalid request' });

        if (parsed.data.role !== undefined) updateUserRole(request.params.id, parsed.data.role);
        if (parsed.data.quotaBytes !== undefined)
          updateUserQuota(request.params.id, parsed.data.quotaBytes);

        insertAuditLog({
          user_id: request.user!.id,
          action: 'admin.user.updated',
          resource: request.params.id,
          ip: request.ip,
          created_at: new Date().toISOString(),
        });
        return reply.send({ ok: true });
      },
    );

    app.delete<{ Params: { id: string } }>(
      '/api/v1/admin/users/:id',
      { preHandler: requireAdmin },
      async (request, reply) => {
        const targetId = request.params.id;
        if (targetId === request.user!.id) {
          return reply.status(400).send({ error: 'Cannot delete your own account' });
        }

        // Cascade: every share owned by this user is destroyed (storage + DB),
        // sessions are revoked, then the user row is removed. Otherwise the
        // shares become orphaned, count against admin stats, and may live past
        // their owner indefinitely.
        const shares = getSharesByUser(targetId);
        for (const share of shares) {
          try {
            await storage.delete(share.id);
          } catch {
            /* already gone */
          }
          deleteShare(share.id);
        }
        deleteUserSessions(targetId);
        deleteUser(targetId);

        insertAuditLog({
          user_id: request.user!.id,
          action: 'admin.user.deleted',
          resource: targetId,
          ip: request.ip,
          created_at: new Date().toISOString(),
        });
        return reply.send({ ok: true, sharesDeleted: shares.length });
      },
    );

    // ------------------------------------------------------------------ shares

    app.get('/api/v1/admin/shares', { preHandler: requireAdmin }, async (request, reply) => {
      const query = request.query as { limit?: string; offset?: string };
      const limit = Math.min(Number(query.limit ?? 50), 200);
      const offset = Number(query.offset ?? 0);
      const now = new Date();

      return reply.send({
        total: countShares(),
        shares: listAllShares(limit, offset).map((s) => ({
          id: s.id,
          wordcode: s.wordcode,
          createdAt: s.created_at,
          expiresAt: s.expires_at,
          expired: new Date(s.expires_at) < now,
          downloadLimit: s.download_limit,
          downloadsUsed: s.downloads_used,
          totalSizeBytes: s.total_size_bytes,
          userId: s.user_id,
          userEmail: s.user_email,
          passwordProtected: s.password_protected === 1,
        })),
      });
    });

    app.delete<{ Params: { id: string } }>(
      '/api/v1/admin/shares/:id',
      { preHandler: requireAdmin },
      async (request, reply) => {
        try {
          await storage.delete(request.params.id);
        } catch {
          /* already gone */
        }
        deleteShare(request.params.id);
        insertAuditLog({
          user_id: request.user!.id,
          action: 'admin.share.deleted',
          resource: request.params.id,
          ip: request.ip,
          created_at: new Date().toISOString(),
        });
        return reply.send({ ok: true });
      },
    );

    // ------------------------------------------------------------------ audit

    app.get('/api/v1/admin/audit', { preHandler: requireAdmin }, async (request, reply) => {
      const query = request.query as { limit?: string; offset?: string };
      const limit = Math.min(Number(query.limit ?? 50), 200);
      const offset = Number(query.offset ?? 0);

      return reply.send({
        total: countAuditLogAll(),
        entries: getAuditLogAll(limit, offset),
      });
    });

    // ------------------------------------------------------------------ health

    app.get('/api/v1/admin/health', { preHandler: requireAdmin }, async (_request, reply) => {
      const stats = getStats();
      return reply.send({
        ...stats,
        uptime: process.uptime(),
        nodeVersion: process.version,
        memoryMB: Math.round(process.memoryUsage().rss / 1024 / 1024),
        platform: process.platform,
      });
    });

    // ------------------------------------------------------------------ settings

    app.get('/api/v1/admin/settings', { preHandler: requireAdmin }, async (_request, reply) => {
      const stored = getAllSettings();
      const result: Record<string, string> = {};
      for (const key of Object.keys(DEFAULT_SETTINGS)) {
        result[key] = stored[key] ?? DEFAULT_SETTINGS[key] ?? '';
      }
      return reply.send(result);
    });

    const SettingsBody = z.object({
      registration_enabled: z.boolean().optional(),
      default_quota_bytes: z.number().int().min(0).optional(),
      max_upload_size_bytes: z.number().int().min(0).optional(),
      max_expiry_hours: z.number().int().min(1).optional(),
    });

    app.patch('/api/v1/admin/settings', { preHandler: requireAdmin }, async (request, reply) => {
      const parsed = SettingsBody.safeParse(request.body);
      if (!parsed.success) return reply.status(400).send({ error: 'Invalid request' });

      const data = parsed.data;
      if (data.registration_enabled !== undefined)
        setSetting('registration_enabled', String(data.registration_enabled));
      if (data.default_quota_bytes !== undefined)
        setSetting('default_quota_bytes', String(data.default_quota_bytes));
      if (data.max_upload_size_bytes !== undefined)
        setSetting('max_upload_size_bytes', String(data.max_upload_size_bytes));
      if (data.max_expiry_hours !== undefined)
        setSetting('max_expiry_hours', String(data.max_expiry_hours));

      insertAuditLog({
        user_id: request.user!.id,
        action: 'admin.settings.updated',
        resource: null,
        ip: request.ip,
        created_at: new Date().toISOString(),
      });

      // Return the updated settings so the UI can apply them without a second fetch.
      const stored = getAllSettings();
      const result: Record<string, string> = {};
      for (const key of Object.keys(DEFAULT_SETTINGS)) {
        result[key] = stored[key] ?? DEFAULT_SETTINGS[key] ?? '';
      }
      return reply.send(result);
    });

    // ------------------------------------------------------------------ smtp
    //
    // SMTP runtime settings live in `system_settings` so an admin can
    // configure the notify-on-download mailer at runtime. Sensitive
    // fields (password) NEVER round-trip back to the client — the GET
    // response replaces the stored value with the literal string
    // `__set__` when one is configured, so the UI can show "stored"
    // without exposing the secret. PATCH only updates fields that the
    // client explicitly sent; an empty string clears, undefined leaves
    // the existing value alone.

    const SmtpKeys = [
      'smtp_host',
      'smtp_port',
      'smtp_secure',
      'smtp_user',
      'smtp_pass',
      'smtp_from',
    ] as const;
    type SmtpKey = (typeof SmtpKeys)[number];

    function readSmtpForResponse(): Record<SmtpKey, string> {
      const out = {} as Record<SmtpKey, string>;
      for (const key of SmtpKeys) {
        const v = getSetting(key) ?? '';
        out[key] = key === 'smtp_pass' && v !== '' ? '__set__' : v;
      }
      return out;
    }

    app.get(
      '/api/v1/admin/settings/smtp',
      { preHandler: requireAdmin },
      async (_request, reply) => {
        return reply.send({
          env: {
            // Surface env-only values so the admin UI can show "currently
            // taken from env" hints when no DB override exists.
            host: (process.env.SMTP_HOST ?? '').trim(),
            port: (process.env.SMTP_PORT ?? '').trim(),
            secure: (process.env.SMTP_SECURE ?? '').trim(),
            user: (process.env.SMTP_USER ?? '').trim(),
            from: (process.env.SMTP_FROM ?? '').trim(),
            // never echo SMTP_PASS — even via env diagnostics
          },
          settings: readSmtpForResponse(),
        });
      },
    );

    const SmtpBody = z.object({
      smtp_host: z.string().max(254).optional(),
      smtp_port: z
        .string()
        .regex(/^\d{1,5}$/, 'must be 1–65535')
        .optional()
        .or(z.literal('')),
      smtp_secure: z.enum(['true', 'false', '']).optional(),
      smtp_user: z.string().max(254).optional(),
      smtp_pass: z.string().max(1024).optional(),
      smtp_from: z.string().max(254).optional(),
    });

    app.patch(
      '/api/v1/admin/settings/smtp',
      { preHandler: requireAdmin },
      async (request, reply) => {
        const parsed = SmtpBody.safeParse(request.body);
        if (!parsed.success) {
          return reply
            .status(400)
            .send({ error: 'Invalid request', details: parsed.error.flatten() });
        }
        const data = parsed.data;
        // Empty string deliberately clears; the DB-vs-env fallback in
        // `getMailerConfig` then surfaces the env value (or disables the
        // mailer entirely if env is also empty).
        for (const key of SmtpKeys) {
          if (data[key] !== undefined) {
            setSetting(key, data[key]!);
          }
        }
        insertAuditLog({
          user_id: request.user!.id,
          action: 'admin.smtp.updated',
          resource: null,
          ip: request.ip,
          created_at: new Date().toISOString(),
        });
        return reply.send({ settings: readSmtpForResponse() });
      },
    );

    const SmtpTestBody = z.object({ to: z.string().email() });
    app.post(
      '/api/v1/admin/settings/smtp/test',
      { preHandler: requireAdmin },
      async (request, reply) => {
        const parsed = SmtpTestBody.safeParse(request.body);
        if (!parsed.success) {
          return reply.status(400).send({ error: 'Recipient is not a valid email address' });
        }
        try {
          await verifyAndSendTest(parsed.data.to);
        } catch (err) {
          const detail = err instanceof Error ? err.message : 'unknown error';
          return reply.status(502).send({ error: detail });
        }
        insertAuditLog({
          user_id: request.user!.id,
          action: 'admin.smtp.test_sent',
          resource: parsed.data.to,
          ip: request.ip,
          created_at: new Date().toISOString(),
        });
        return reply.send({ ok: true });
      },
    );
  };
}
