import { randomBytes } from 'node:crypto';
import multipart from '@fastify/multipart';
import type { FastifyInstance } from 'fastify';
import { UploadMetaSchema } from '@itsweber-send/shared';
import { insertShare, getUserById, getUserQuotaUsed } from '../db/sqlite.js';
import type { StorageAdapter } from '../storage/interface.js';
import { emitWebhook } from '../plugins/webhooks.js';

const MAX_FILE_SIZE = 5 * 1024 * 1024 * 1024; // 5 GB
const MAX_FIELD_SIZE = 64 * 1024;              // 64 KB for text fields

// Upload throttle: per-IP cap on the number of upload requests. Each request
// carries up to MAX_FILE_SIZE, so the count limit is the real lever — large
// transfers are bounded by Caddy's request_body cap and the multipart limits.
const UPLOAD_RATE_LIMIT = {
  max: 20,
  timeWindow: '1 hour',
} as const;

export function createUploadRoute(storage: StorageAdapter) {
  return async function uploadPlugin(app: FastifyInstance): Promise<void> {
    await app.register(multipart, {
      limits: {
        fileSize: MAX_FILE_SIZE,
        fieldSize: MAX_FIELD_SIZE,
        files: 210, // up to 100 blobs + their IVs + manifest + manifest-iv + meta
      },
    });

    app.post('/api/v1/upload', { config: { rateLimit: UPLOAD_RATE_LIMIT } }, async (request, reply) => {
      // Collect all multipart parts into a map
      type FieldEntry = { type: 'field'; value: string };
      type FileEntry = { type: 'file'; value: Buffer };
      const parts: Record<string, FieldEntry | FileEntry> = {};

      for await (const part of request.parts()) {
        if (part.type === 'field') {
          parts[part.fieldname] = { type: 'field', value: part.value as string };
        } else {
          parts[part.fieldname] = { type: 'file', value: await part.toBuffer() };
        }
      }

      // Validate meta field
      const metaEntry = parts['meta'];
      if (!metaEntry || metaEntry.type !== 'field') {
        return reply.status(400).send({ error: 'Missing or invalid meta field' });
      }

      let rawMeta: unknown;
      try {
        rawMeta = JSON.parse(metaEntry.value) as unknown;
      } catch {
        return reply.status(400).send({ error: 'meta is not valid JSON' });
      }

      const parsed = UploadMetaSchema.safeParse(rawMeta);
      if (!parsed.success) {
        return reply.status(400).send({ error: 'Invalid meta', details: parsed.error.flatten() });
      }
      const meta = parsed.data;

      // Validate password fields: if passwordProtected, salt/ivWrap/wrappedKey must be present
      if (meta.passwordProtected && (!meta.salt || !meta.ivWrap || !meta.wrappedKey)) {
        return reply.status(400).send({ error: 'Password-protected upload missing crypto fields' });
      }

      // Extract manifest
      const manifestIvEntry = parts['manifest-iv'];
      const manifestEntry = parts['manifest'];
      if (!manifestIvEntry || manifestIvEntry.type !== 'field') {
        return reply.status(400).send({ error: 'Missing manifest-iv field' });
      }
      if (!manifestEntry || manifestEntry.type !== 'file') {
        return reply.status(400).send({ error: 'Missing manifest file part' });
      }

      // Collect blob parts (blob-0001 … blob-NNNN)
      const blobEntries: Array<{ iv: string; data: Buffer }> = [];
      for (let i = 1; i <= meta.fileCount; i++) {
        const idx = String(i).padStart(4, '0');
        const ivEntry = parts[`blob-${idx}-iv`];
        const dataEntry = parts[`blob-${idx}`];
        if (!ivEntry || ivEntry.type !== 'field') {
          return reply.status(400).send({ error: `Missing blob-${idx}-iv field` });
        }
        if (!dataEntry || dataEntry.type !== 'file') {
          return reply.status(400).send({ error: `Missing blob-${idx} file part` });
        }
        blobEntries.push({ iv: ivEntry.value, data: dataEntry.value });
      }

      // Quota check for authenticated users
      const userId = request.user?.id ?? null;
      if (userId) {
        const user = getUserById(userId);
        if (user) {
          const quotaUsed = getUserQuotaUsed(userId);
          if (quotaUsed + meta.totalSizeEncrypted > user.quota_bytes) {
            return reply.status(413).send({ error: 'Quota exceeded' });
          }
        }
      }

      // Generate share ID and timestamps
      const id = randomBytes(12).toString('hex');
      const now = new Date();
      const expiresAt = new Date(now.getTime() + meta.expiryHours * 60 * 60 * 1000);

      // Write to storage
      await storage.put(id, 'manifest', manifestEntry.value);
      await storage.put(id, 'manifest.iv', Buffer.from(manifestIvEntry.value));
      for (let i = 0; i < blobEntries.length; i++) {
        const blobEntry = blobEntries[i];
        if (!blobEntry) continue;
        const idx = String(i + 1).padStart(4, '0');
        await storage.put(id, `blob-${idx}`, blobEntry.data);
        await storage.put(id, `blob-${idx}.iv`, Buffer.from(blobEntry.iv));
      }

      // Write unencrypted meta.json for wire-format compliance
      const metaJson = JSON.stringify({
        createdAt: now.toISOString(),
        expiresAt: expiresAt.toISOString(),
        downloadLimit: meta.downloadLimit,
        passwordRequired: meta.passwordProtected,
        salt: meta.salt,
        ivWrap: meta.ivWrap,
        wrappedKey: meta.wrappedKey,
      });
      await storage.put(id, 'meta.json', Buffer.from(metaJson));

      // Insert DB record
      insertShare({
        id,
        created_at: now.toISOString(),
        expires_at: expiresAt.toISOString(),
        download_limit: meta.downloadLimit,
        downloads_used: 0,
        salt: meta.salt,
        iv_wrap: meta.ivWrap,
        wrapped_key: meta.wrappedKey,
        user_id: userId,
        total_size_bytes: meta.totalSizeEncrypted,
      });

      request.log.info({ shareId: id, fileCount: meta.fileCount, userId }, 'share created');

      void emitWebhook(
        {
          type: 'upload.created',
          shareId: id,
          fileCount: meta.fileCount,
          totalSizeBytes: meta.totalSizeEncrypted,
          userId,
          expiresAt: expiresAt.toISOString(),
        },
        request.log,
      );

      return reply.status(201).send({ id, expiresAt: expiresAt.toISOString() });
    });
  };
}
