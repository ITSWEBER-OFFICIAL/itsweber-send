import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import Fastify from 'fastify';
import { config } from './config.js';
import { registerCore } from './plugins/core.js';
import { healthRoutes } from './routes/health.js';
import { createUploadRoute } from './routes/upload.js';
import { createDownloadRoute } from './routes/download.js';
import { FilesystemStorage } from './storage/filesystem.js';
import { initDb } from './db/sqlite.js';
import { startCleanupJob } from './jobs/cleanup.js';

export async function buildServer() {
  const app = Fastify({
    logger: {
      level: config.logLevel,
      transport:
        config.env === 'development'
          ? { target: 'pino-pretty', options: { colorize: true, translateTime: 'HH:MM:ss.l' } }
          : undefined,
    },
    disableRequestLogging: false,
    trustProxy: true,
    bodyLimit: 1024 * 1024, // 1 MB for JSON/form bodies; multipart has its own limits
  });

  await registerCore(app);
  await app.register(healthRoutes);

  // Storage and DB
  const storage = new FilesystemStorage(config.storage.path);
  initDb(config.db.path);
  startCleanupJob(storage, app.log);

  // Upload / download routes
  await app.register(createUploadRoute(storage));
  await app.register(createDownloadRoute(storage));

  // Serve the SvelteKit app as a fallback for all non-API routes (production only).
  // Registered via setNotFoundHandler so Fastify's own routes (/api/*, /health) win first;
  // in development, Vite serves the frontend on its own port and proxies /api back here.
  if (config.env === 'production') {
    const here = dirname(fileURLToPath(import.meta.url));
    const handlerPath = resolve(here, '../../web/build/handler.js');
    if (existsSync(handlerPath)) {
      const mod = (await import(handlerPath)) as {
        handler: (req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse, next: (err?: unknown) => void) => void;
      };
      app.setNotFoundHandler((request, reply) => {
        reply.hijack();
        return new Promise<void>((resolvePromise, rejectPromise) => {
          mod.handler(request.raw, reply.raw, (err?: unknown) => {
            if (err) rejectPromise(err);
            else resolvePromise();
          });
        });
      });
      app.log.info({ handlerPath }, 'SvelteKit handler mounted as notFoundHandler');
    } else {
      app.log.warn({ handlerPath }, 'SvelteKit build not found — API only');
    }
  }

  return app;
}

async function main() {
  const app = await buildServer();

  const shutdown = async (signal: string) => {
    app.log.info({ signal }, 'shutting down');
    try {
      await app.close();
      process.exit(0);
    } catch (err) {
      app.log.error({ err }, 'error during shutdown');
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));

  try {
    await app.listen({ host: config.host, port: config.port });
  } catch (err) {
    app.log.error({ err }, 'failed to start server');
    process.exit(1);
  }
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  void main();
}
