import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { existsSync } from 'node:fs';
import Fastify from 'fastify';
import { config } from './config.js';
import { registerOpenApi } from './plugins/openapi.js';
import { registerCore } from './plugins/core.js';
import { sessionMiddleware } from './plugins/session.js';
import { healthRoutes } from './routes/health.js';
import { createUploadRoute } from './routes/upload.js';
import { createUploadsResumableRoute } from './routes/uploads-resumable.js';
import { createDownloadRoute } from './routes/download.js';
import { authRoutes } from './routes/auth.js';
import { createAccountRoutes } from './routes/account.js';
import { createAdminRoutes } from './routes/admin.js';
import { receiveRoutes } from './routes/receive.js';
import { FilesystemStorage } from './storage/filesystem.js';
import { S3Storage } from './storage/s3.js';
import type { StorageAdapter } from './storage/interface.js';
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

  // OpenAPI must be registered before routes so Fastify can collect schema definitions.
  await registerOpenApi(app);
  await registerCore(app);
  await app.register(sessionMiddleware);
  await app.register(healthRoutes);

  // Storage and DB
  let storage: StorageAdapter;
  if (config.storage.backend === 's3') {
    if (!config.storage.s3.bucket) {
      throw new Error('S3_BUCKET must be set when STORAGE_BACKEND=s3');
    }
    // S3 multipart enforces a 5 MiB minimum part size (except the last
    // part) and a 10 000-part ceiling per object. Validate the configured
    // chunk size up front so we fail at boot rather than mid-upload.
    const minPartSize = 5 * 1024 * 1024;
    if (config.uploads.chunkSizeBytes < minPartSize) {
      throw new Error(
        `STORAGE_BACKEND=s3 requires CHUNK_SIZE_BYTES >= ${minPartSize} (5 MiB); ` +
          `got ${config.uploads.chunkSizeBytes}`,
      );
    }
    const s3MaxBlobBytes = 10000 * config.uploads.chunkSizeBytes;
    if (config.uploads.maxBlobBytes > s3MaxBlobBytes) {
      app.log.warn(
        {
          maxBlobBytes: config.uploads.maxBlobBytes,
          chunkSizeBytes: config.uploads.chunkSizeBytes,
          s3MaxBlobBytes,
        },
        'MAX_BLOB_BYTES exceeds the S3 multipart per-object ceiling at the current chunk size; ' +
          'increase CHUNK_SIZE_BYTES or lower MAX_BLOB_BYTES',
      );
    }
    storage = new S3Storage(config.storage.s3.bucket, {
      endpoint: config.storage.s3.endpoint || undefined,
      region: config.storage.s3.region,
      forcePathStyle: config.storage.s3.forcePathStyle,
    });
    app.log.info({ backend: 's3', bucket: config.storage.s3.bucket }, 'storage adapter');
  } else {
    storage = new FilesystemStorage(config.storage.path);
    app.log.info({ backend: 'filesystem', path: config.storage.path }, 'storage adapter');
  }
  initDb(config.db.path);
  startCleanupJob(storage, app.log);

  // Upload / download routes. The legacy single-shot /api/v1/upload is
  // retained for v1.0 client compatibility (manifest version 1, files up
  // to 500 MB). New clients use the resumable /api/v1/uploads/* routes.
  await app.register(createUploadRoute(storage));
  await app.register(createUploadsResumableRoute(storage));
  await app.register(createDownloadRoute(storage));

  // Auth, account, and admin routes
  await app.register(authRoutes);
  await app.register(createAccountRoutes(storage));
  await app.register(createAdminRoutes(storage));
  await app.register(receiveRoutes);

  // Serve the SvelteKit app as a fallback for all non-API routes (production only).
  // Registered via setNotFoundHandler so Fastify's own routes (/api/*, /health) win first;
  // in development, Vite serves the frontend on its own port and proxies /api back here.
  if (config.env === 'production') {
    const here = dirname(fileURLToPath(import.meta.url));
    const handlerPath = resolve(here, '../../web/build/handler.js');
    if (existsSync(handlerPath)) {
      // Convert to a file:// URL so dynamic import works on Windows (Node's
      // ESM loader rejects raw `C:\…` paths with ERR_UNSUPPORTED_ESM_URL_SCHEME).
      const mod = (await import(pathToFileURL(handlerPath).href)) as {
        handler: (
          req: import('node:http').IncomingMessage,
          res: import('node:http').ServerResponse,
          next: (err?: unknown) => void,
        ) => void;
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

// Use pathToFileURL so the comparison is correct on Windows, where
// process.argv[1] is `C:\path\file.js` but import.meta.url is the
// canonical `file:///C:/path/file.js`.
const argv1 = process.argv[1];
const isMain = argv1 ? import.meta.url === pathToFileURL(argv1).href : false;
if (isMain) {
  void main();
}
