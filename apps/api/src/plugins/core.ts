import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import cookie from '@fastify/cookie';
import type { FastifyInstance } from 'fastify';
import { config } from '../config.js';

/**
 * Core plugins applied to every route: security headers, CORS, rate limiting, cookies.
 * Upload-specific plugins (tus, multipart) are registered in their own modules.
 */
export async function registerCore(app: FastifyInstance): Promise<void> {
  await app.register(helmet, {
    contentSecurityPolicy: false, // CSP is set by SvelteKit on the web side
    crossOriginOpenerPolicy: { policy: 'same-origin' },
    crossOriginEmbedderPolicy: false, // enabled in M5 once we audit cross-origin assets
    referrerPolicy: { policy: 'no-referrer' },
    strictTransportSecurity: {
      maxAge: 63072000,
      includeSubDomains: true,
      preload: true,
    },
  });

  await app.register(cors, {
    origin: config.env === 'development' ? true : false,
    credentials: true,
  });

  await app.register(rateLimit, {
    max: config.rateLimitPerMin,
    timeWindow: '1 minute',
    allowList: ['127.0.0.1', '::1'],
  });

  // Cookie plugin must be registered before the session middleware
  await app.register(cookie);
}
