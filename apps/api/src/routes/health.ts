import type { FastifyInstance } from 'fastify';
import { getShare } from '../db/sqlite.js';

const startedAt = Date.now();

export async function healthRoutes(app: FastifyInstance): Promise<void> {
  // Health and readiness probes opt out of the global rate limit so that
  // container orchestrators / Caddy's healthchecks are never throttled.
  const noRateLimit = { config: { rateLimit: false } } as const;

  app.get('/health', noRateLimit, async () => {
    return {
      status: 'ok',
      uptimeMs: Date.now() - startedAt,
      version: '1.2.0-rc2',
    };
  });

  app.get('/ready', noRateLimit, async (_request, reply) => {
    try {
      // Verify DB is responsive with a lightweight query
      getShare('__probe__');
      return reply.send({ ready: true });
    } catch {
      return reply.status(503).send({ ready: false, error: 'Database not available' });
    }
  });
}
