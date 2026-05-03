import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { getShare, incrementDownloads } from '../db/sqlite.js';
import type { StorageAdapter } from '../storage/interface.js';
import { emitWebhook } from '../plugins/webhooks.js';
import { isMailerEnabled, sendMail } from '../utils/mailer.js';
import { config } from '../config.js';

/** Parse a single-range HTTP `Range: bytes=start-end` header. Multi-range
 *  is not supported; we return null and the caller falls back to a full
 *  body. End is inclusive when present. */
function parseRange(
  headerValue: string | undefined,
  size: number,
): { start: number; end: number } | null {
  if (!headerValue) return null;
  const m = /^bytes=(\d+)?-(\d+)?$/.exec(headerValue.trim());
  if (!m) return null;
  const startStr = m[1];
  const endStr = m[2];
  let start: number;
  let end: number;
  if (startStr === undefined && endStr !== undefined) {
    // suffix range: last N bytes
    const suffix = Number(endStr);
    if (!Number.isFinite(suffix) || suffix === 0) return null;
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else if (startStr !== undefined) {
    start = Number(startStr);
    end = endStr !== undefined ? Number(endStr) : size - 1;
  } else {
    return null;
  }
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  if (start < 0 || end >= size || start > end) return null;
  return { start, end };
}

export function createDownloadRoute(storage: StorageAdapter) {
  return async function downloadPlugin(app: FastifyInstance): Promise<void> {
    // GET /api/v1/download/:id/manifest
    // Returns share metadata + encrypted manifest so the client can decrypt it.
    app.get<{ Params: { id: string } }>('/api/v1/download/:id/manifest', async (request, reply) => {
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
        share.download_limit === 0 ? null : share.download_limit - share.downloads_used;

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
        manifestVersion: share.manifest_version,
        fileCount: share.file_count,
      });
    });

    // GET /api/v1/download/:id/blob/:n
    // Streams the nth blob ciphertext (n is 1-based) and decrements
    // downloads_used on the LAST blob's first successful (non-Range)
    // delivery. Range requests do not decrement so resumed/parallel range
    // fetches stay free of double-counting.
    app.get<{ Params: { id: string; n: string } }>(
      '/api/v1/download/:id/blob/:n',
      async (request: FastifyRequest, reply: FastifyReply) => {
        const params = request.params as { id: string; n: string };
        const { id, n } = params;

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

        if (blobNum > share.file_count) {
          return reply.status(400).send({ error: 'Invalid blob index' });
        }

        const blobName = `blob-${String(blobNum).padStart(4, '0')}`;
        const fullSize = await storage.size(id, blobName);
        if (fullSize === null) {
          return reply.status(404).send({ error: 'Blob not found' });
        }

        const range = parseRange(request.headers.range as string | undefined, fullSize);
        const isLastBlob = blobNum === share.file_count;
        const isFullDelivery = range === null;

        // Counter increments only on a complete (non-Range) read of the
        // last blob. Range fetches (browser refresh, ZIP partial reads)
        // stay free.
        if (isLastBlob && isFullDelivery) {
          incrementDownloads(id);
          const freshShare = getShare(id);
          const remaining =
            freshShare && freshShare.download_limit > 0
              ? freshShare.download_limit - freshShare.downloads_used
              : null;
          void emitWebhook(
            {
              type: 'download.completed',
              shareId: id,
              blobIndex: blobNum,
              remainingDownloads: remaining,
            },
            request.log,
          );

          // Notify-on-download: fire only on the *first* successful download
          // (downloads_used just transitioned 0 → 1). Subsequent downloads
          // stay silent — the sender wanted to know "did it arrive", not
          // a per-fetch ping. Send is intentionally fire-and-forget; any
          // SMTP failure is logged but never blocks the response.
          if (
            freshShare &&
            freshShare.notify_email &&
            freshShare.downloads_used === 1 &&
            isMailerEnabled()
          ) {
            const recipient = freshShare.notify_email;
            const shareUrl = `${config.baseUrl.replace(/\/$/, '')}/d/${id}`;
            const subject = 'Your ITSWEBER Send share was downloaded';
            const text =
              `Your share ${id} was just downloaded for the first time.\n\n` +
              `Share URL: ${shareUrl}\n` +
              `Time: ${new Date().toISOString()}\n\n` +
              `If you did not expect this, the link or password may have leaked.`;
            void sendMail(recipient, subject, text).catch((err: unknown) => {
              request.log.warn(
                { err, shareId: id, recipient },
                'notify-on-download email send failed',
              );
            });
          }
        }

        request.log.info(
          { shareId: id, blobNum, isLastBlob, range: range ?? undefined, fullSize },
          'blob downloaded',
        );

        let stream;
        try {
          stream = await storage.getStream(id, blobName, range ?? undefined);
        } catch (err) {
          request.log.error({ err, shareId: id, blobName }, 'blob stream open failed');
          return reply.status(500).send({ error: 'Storage read failed' });
        }

        reply
          .header('Content-Type', 'application/octet-stream')
          .header('Accept-Ranges', 'bytes')
          .header('Cache-Control', 'no-store');

        if (range) {
          const length = range.end - range.start + 1;
          reply
            .status(206)
            .header('Content-Range', `bytes ${range.start}-${range.end}/${fullSize}`)
            .header('Content-Length', length);
        } else {
          reply.header('Content-Length', fullSize);
        }
        return reply.send(stream);
      },
    );
  };
}
