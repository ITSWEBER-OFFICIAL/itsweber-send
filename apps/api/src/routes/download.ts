import type { FastifyInstance } from 'fastify';
import { getShare, incrementDownloads } from '../db/sqlite.js';
import type { StorageAdapter } from '../storage/interface.js';

export function createDownloadRoute(storage: StorageAdapter) {
  return async function downloadPlugin(app: FastifyInstance): Promise<void> {
    // GET /api/v1/download/:id/manifest
    // Returns share metadata + encrypted manifest so the client can decrypt it.
    app.get<{ Params: { id: string } }>(
      '/api/v1/download/:id/manifest',
      async (request, reply) => {
        const { id } = request.params;

        const share = getShare(id);
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

        const manifestBuf = await storage.get(id, 'manifest');
        const manifestIvBuf = await storage.get(id, 'manifest.iv');

        const remaining =
          share.download_limit === 0
            ? null
            : share.download_limit - share.downloads_used;

        return reply.send({
          id: share.id,
          createdAt: share.created_at,
          expiresAt: share.expires_at,
          passwordRequired: share.salt !== null,
          remainingDownloads: remaining,
          manifestCiphertext: manifestBuf.toString('base64url'),
          manifestIv: manifestIvBuf.toString().trim(),
          salt: share.salt,
          ivWrap: share.iv_wrap,
          wrappedKey: share.wrapped_key,
        });
      },
    );

    // GET /api/v1/download/:id/blob/:n
    // Streams the nth blob ciphertext (n is 1-based) and decrements downloads_used.
    app.get<{ Params: { id: string; n: string } }>(
      '/api/v1/download/:id/blob/:n',
      async (request, reply) => {
        const { id, n } = request.params;

        const blobNum = parseInt(n, 10);
        if (!Number.isInteger(blobNum) || blobNum < 1) {
          return reply.status(400).send({ error: 'Invalid blob index' });
        }

        const share = getShare(id);
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

        const blobName = `blob-${String(blobNum).padStart(4, '0')}`;
        let blobBuf: Buffer;
        try {
          blobBuf = await storage.get(id, blobName);
        } catch {
          return reply.status(404).send({ error: 'Blob not found' });
        }

        // Decrement after successful read, before sending, to avoid double-counting retries
        incrementDownloads(id);

        request.log.info({ shareId: id, blobNum }, 'blob downloaded');
        return reply
          .header('Content-Type', 'application/octet-stream')
          .header('Content-Length', blobBuf.byteLength)
          .send(blobBuf);
      },
    );
  };
}
