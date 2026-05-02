/**
 * Session middleware for ITSWEBER Send.
 *
 * Reads the HttpOnly `sid` cookie, validates it against the sessions table,
 * and attaches `request.user` for downstream route handlers.
 *
 * Security notes:
 * - Session IDs are 32 random bytes (256 bits), unguessable.
 * - Cookies are HttpOnly + SameSite=Strict. Secure flag set in production.
 * - Sessions expire server-side (DB check) and client-side (cookie maxAge).
 */

import fp from 'fastify-plugin';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { getSession, getUserById } from '../db/sqlite.js';

export interface SessionUser {
  id: string;
  email: string;
  role: 'user' | 'admin';
  quotaBytes: number;
}

declare module 'fastify' {
  interface FastifyRequest {
    user: SessionUser | null;
  }
}

async function sessionPlugin(app: FastifyInstance): Promise<void> {
  app.decorateRequest('user', null);

  app.addHook('preHandler', async (request: FastifyRequest) => {
    const sid = request.cookies?.sid;
    if (!sid) return;

    const session = getSession(sid);
    if (!session) return;

    const user = getUserById(session.user_id);
    if (!user) return;

    request.user = {
      id: user.id,
      email: user.email,
      role: user.role,
      quotaBytes: user.quota_bytes,
    };
  });
}

export const sessionMiddleware = fp(sessionPlugin, {
  name: 'session',
  dependencies: ['@fastify/cookie'],
});

// ---------------------------------------------------------------------------
// Route guards — use as preHandler on protected routes
// ---------------------------------------------------------------------------

export async function requireAuth(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  if (!request.user) {
    await reply.status(401).send({ error: 'Authentication required' });
  }
}

export async function requireAdmin(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  if (!request.user) {
    await reply.status(401).send({ error: 'Authentication required' });
    return;
  }
  if (request.user.role !== 'admin') {
    await reply.status(403).send({ error: 'Admin access required' });
  }
}
