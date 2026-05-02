import type { FastifyInstance } from 'fastify';
import { getSharesByUser, getUserQuotaUsed } from '../db/sqlite.js';
import { requireAuth } from '../plugins/session.js';
import type { StorageAdapter } from '../storage/interface.js';
import { deleteShare } from '../db/sqlite.js';

export function createAccountRoutes(storage: StorageAdapter) {
  return async function accountPlugin(app: FastifyInstance): Promise<void> {
    // GET /api/v1/account/uploads
    app.get(
      '/api/v1/account/uploads',
      { preHandler: requireAuth },
      async (request, reply) => {
        const user = request.user!;
        const shares = getSharesByUser(user.id);
        const quotaUsed = getUserQuotaUsed(user.id);

        const now = new Date();
        const uploads = shares.map((s) => ({
          id: s.id,
          createdAt: s.created_at,
          expiresAt: s.expires_at,
          expired: new Date(s.expires_at) < now,
          downloadLimit: s.download_limit,
          downloadsUsed: s.downloads_used,
          totalSizeBytes: s.total_size_bytes,
          passwordProtected: s.salt !== null,
        }));

        return reply.send({
          uploads,
          quota: {
            totalBytes: user.quotaBytes,
            usedBytes: quotaUsed,
            remainingBytes: Math.max(0, user.quotaBytes - quotaUsed),
          },
        });
      },
    );

    // DELETE /api/v1/account/uploads/:id
    app.delete<{ Params: { id: string } }>(
      '/api/v1/account/uploads/:id',
      { preHandler: requireAuth },
      async (request, reply) => {
        const user = request.user!;
        const shares = getSharesByUser(user.id);
        const share = shares.find((s) => s.id === request.params.id);

        if (!share) {
          return reply.status(404).send({ error: 'Upload not found' });
        }

        try {
          await storage.delete(share.id);
        } catch {
          // Storage files may already be gone; proceed with DB cleanup
        }
        deleteShare(share.id);

        return reply.send({ ok: true });
      },
    );
  };
}
