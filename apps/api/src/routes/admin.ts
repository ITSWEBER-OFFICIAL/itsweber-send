import type { FastifyInstance } from 'fastify';
import { getStats, listUsers } from '../db/sqlite.js';
import { requireAdmin } from '../plugins/session.js';

export async function adminRoutes(app: FastifyInstance): Promise<void> {
  // GET /api/v1/admin/stats
  app.get('/api/v1/admin/stats', { preHandler: requireAdmin }, async (_request, reply) => {
    return reply.send(getStats());
  });

  // GET /api/v1/admin/users
  app.get('/api/v1/admin/users', { preHandler: requireAdmin }, async (request, reply) => {
    const query = (request.query as { limit?: string; offset?: string });
    const limit = Math.min(Number(query.limit ?? 50), 200);
    const offset = Number(query.offset ?? 0);

    const users = listUsers(limit, offset);
    return reply.send(
      users.map((u) => ({
        id: u.id,
        email: u.email,
        role: u.role,
        createdAt: u.created_at,
        lastLoginAt: u.last_login_at,
        quotaBytes: u.quota_bytes,
      })),
    );
  });
}
