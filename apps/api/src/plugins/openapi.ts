import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import type { FastifyInstance } from 'fastify';
import { config } from '../config.js';

export async function registerOpenApi(app: FastifyInstance): Promise<void> {
  await app.register(swagger, {
    openapi: {
      openapi: '3.0.3',
      info: {
        title: 'ITSWEBER Send API',
        description: 'REST API for ITSWEBER Send — self-hosted, end-to-end encrypted file sharing.',
        version: '1.0.0',
        license: { name: 'AGPL-3.0-only' },
      },
      servers: [{ url: config.baseUrl, description: 'This server' }],
      tags: [
        { name: 'system', description: 'Health and readiness probes' },
        { name: 'shares', description: 'Upload and download encrypted file shares' },
        { name: 'auth', description: 'Authentication (requires ENABLE_ACCOUNTS=true)' },
        { name: 'account', description: 'Per-user upload history and quota' },
        { name: 'admin', description: 'Admin-only endpoints' },
      ],
      components: {
        securitySchemes: {
          sessionCookie: {
            type: 'apiKey',
            in: 'cookie',
            name: 'sid',
            description: 'Session cookie set by POST /api/v1/auth/login',
          },
        },
      },
    },
    hideUntagged: false,
  });

  // Only expose the interactive UI in development to avoid leaking route metadata in production.
  if (config.env !== 'production') {
    await app.register(swaggerUi, {
      routePrefix: '/api/v1/docs',
      uiConfig: {
        docExpansion: 'list',
        deepLinking: false,
        tryItOutEnabled: false,
      },
      staticCSP: true,
    });
  }
}
