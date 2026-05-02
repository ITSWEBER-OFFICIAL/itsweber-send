import type { FastifyInstance } from 'fastify';
import { getShareByWordcode } from '../db/sqlite.js';

export async function receiveRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Params: { wordcode: string } }>(
    '/api/v1/r/:wordcode',
    async (request, reply) => {
      const { wordcode } = request.params;
      const share = getShareByWordcode(wordcode.toLowerCase());

      if (!share) {
        return reply.status(404).send({ error: 'Share not found' });
      }

      const now = new Date();
      if (new Date(share.expires_at) < now) {
        return reply.status(410).send({ error: 'Share has expired' });
      }
      if (share.download_limit > 0 && share.downloads_used >= share.download_limit) {
        return reply.status(410).send({ error: 'Download limit reached' });
      }

      return reply.send({ shareId: share.id });
    },
  );
}
