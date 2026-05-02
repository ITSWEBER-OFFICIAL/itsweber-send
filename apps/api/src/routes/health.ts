import type { FastifyInstance } from 'fastify';
import { getShare } from '../db/sqlite.js';

const startedAt = Date.now();

export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get('/health', async () => {
    return {
      status: 'ok',
      uptimeMs: Date.now() - startedAt,
      version: '0.1.0',
    };
  });

  app.get('/ready', async (_request, reply) => {
    try {
      // Verify DB is responsive with a lightweight query
      getShare('__probe__');
      return reply.send({ ready: true });
    } catch {
      return reply.status(503).send({ ready: false, error: 'Database not available' });
    }
  });
}
