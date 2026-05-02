import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import cookie from '@fastify/cookie';
import type { FastifyInstance } from 'fastify';
import { config } from '../config.js';

/**
 * Core plugins applied to every route: security headers, CORS, rate limiting, cookies.
 *
 * Header strategy:
 * - Helmet sets strict baseline headers on every Fastify response (incl. JSON API).
 * - SvelteKit emits its own CSP header for HTML responses (svelte.config.js); the
 *   Fastify CSP below is identical so JSON/error responses get the same protection.
 * - Caddy in front re-applies the same set as a defense-in-depth layer and to
 *   guarantee headers on responses generated outside the Node process (e.g. 502s).
 */
export async function registerCore(app: FastifyInstance): Promise<void> {
  const isProduction = config.env === 'production';

  await app.register(helmet, {
    // Strict CSP. Mirrors the SvelteKit-side policy in apps/web/svelte.config.js so
    // JSON/error responses from the API enforce the same boundaries as the HTML.
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        'default-src': ["'self'"],
        'script-src': ["'self'"],
        'style-src': ["'self'", "'unsafe-inline'"],
        'img-src': ["'self'", 'data:', 'blob:'],
        'font-src': ["'self'", 'data:'],
        'connect-src': ["'self'"],
        'worker-src': ["'self'", 'blob:'],
        'manifest-src': ["'self'"],
        'frame-ancestors': ["'none'"],
        'frame-src': ["'none'"],
        'object-src': ["'none'"],
        'base-uri': ["'self'"],
        'form-action': ["'self'"],
        ...(isProduction ? { 'upgrade-insecure-requests': [] } : {}),
      },
    },
    crossOriginOpenerPolicy: { policy: 'same-origin' },
    // credentialless lets us load same-origin data:/blob: resources without
    // requiring a CORP header on every static asset, while still isolating
    // the document from third-party context.
    crossOriginEmbedderPolicy: { policy: 'credentialless' },
    crossOriginResourcePolicy: { policy: 'same-origin' },
    referrerPolicy: { policy: 'no-referrer' },
    strictTransportSecurity: {
      maxAge: 63072000, // 2 years
      includeSubDomains: true,
      preload: true,
    },
    xContentTypeOptions: true,
    xFrameOptions: { action: 'deny' },
    xPermittedCrossDomainPolicies: { permittedPolicies: 'none' },
    xDnsPrefetchControl: { allow: false },
    originAgentCluster: true,
    // Hide framework fingerprint
    hidePoweredBy: true,
  });

  // Permissions-Policy is not part of helmet's default header surface here;
  // we set it explicitly on every response. The list is intentionally narrow:
  // disable every powerful feature we do not use, so a future XSS cannot
  // trigger camera/mic/geolocation prompts.
  app.addHook('onSend', async (_request, reply, payload) => {
    if (!reply.getHeader('Permissions-Policy')) {
      reply.header(
        'Permissions-Policy',
        [
          'accelerometer=()',
          'autoplay=()',
          'camera=()',
          'clipboard-write=(self)',
          'cross-origin-isolated=()',
          'display-capture=()',
          'encrypted-media=()',
          'fullscreen=(self)',
          'geolocation=()',
          'gyroscope=()',
          'magnetometer=()',
          'microphone=()',
          'midi=()',
          'payment=()',
          'picture-in-picture=()',
          'publickey-credentials-get=()',
          'screen-wake-lock=()',
          'sync-xhr=()',
          'usb=()',
          'xr-spatial-tracking=()',
        ].join(', '),
      );
    }
    return payload;
  });

  await app.register(cors, {
    origin: isProduction ? false : true,
    credentials: true,
  });

  // Global rate limit: a coarse safety net. Per-route limits (auth, upload)
  // are tightened where they are registered. The plugin's default keyGenerator
  // uses request.ip, which (with trustProxy enabled in server.ts) resolves to
  // the original client IP via X-Forwarded-For — the proxy must therefore set
  // that header to the IP only, not "ip:port".
  await app.register(rateLimit, {
    global: true,
    max: config.rateLimitPerMin,
    timeWindow: '1 minute',
    // Skip the loopback in non-production so local smoke tests are not throttled.
    allowList: isProduction ? [] : ['127.0.0.1', '::1'],
  });

  // Cookie plugin must be registered before the session middleware
  await app.register(cookie);
}
