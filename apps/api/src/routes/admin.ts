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
        if (parsed.data.quotaBytes !== undefined) updateUserQuota(request.params.id, parsed.data.quotaBytes);

        insertAuditLog({ user_id: request.user!.id, action: 'admin.user.updated', resource: request.params.id, ip: request.ip, created_at: new Date().toISOString() });
        return reply.send({ ok: true });
      },
    );

    app.delete<{ Params: { id: string } }>(
      '/api/v1/admin/users/:id',
      { preHandler: requireAdmin },
      async (request, reply) => {
        if (request.params.id === request.user!.id) {
          return reply.status(400).send({ error: 'Cannot delete your own account' });
        }
        deleteUser(request.params.id);
        insertAuditLog({ user_id: request.user!.id, action: 'admin.user.deleted', resource: request.params.id, ip: request.ip, created_at: new Date().toISOString() });
        return reply.send({ ok: true });
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
        try { await storage.delete(request.params.id); } catch { /* already gone */ }
        deleteShare(request.params.id);
        insertAuditLog({ user_id: request.user!.id, action: 'admin.share.deleted', resource: request.params.id, ip: request.ip, created_at: new Date().toISOString() });
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
      if (data.registration_enabled !== undefined) setSetting('registration_enabled', String(data.registration_enabled));
      if (data.default_quota_bytes !== undefined) setSetting('default_quota_bytes', String(data.default_quota_bytes));
      if (data.max_upload_size_bytes !== undefined) setSetting('max_upload_size_bytes', String(data.max_upload_size_bytes));
      if (data.max_expiry_hours !== undefined) setSetting('max_expiry_hours', String(data.max_expiry_hours));

      insertAuditLog({ user_id: request.user!.id, action: 'admin.settings.updated', resource: null, ip: request.ip, created_at: new Date().toISOString() });
      return reply.send({ ok: true });
    });
  };
}
