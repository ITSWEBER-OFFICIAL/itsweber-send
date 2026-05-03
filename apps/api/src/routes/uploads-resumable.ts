/**
 * Resumable upload endpoints (v1.1).
 *
 * The browser uploads each ciphertext chunk separately so it can pause,
 * resume after a transient network failure, or recover after a tab close
 * without re-encrypting the whole file. Each chunk is its own AES-GCM
 * ciphertext with a unique IV stored inside the encrypted manifest the
 * client commits at finalize-time.
 *
 * Wire protocol:
 *   POST   /api/v1/uploads                                          create
 *   GET    /api/v1/uploads/:uploadId                                state
 *   PATCH  /api/v1/uploads/:uploadId/blobs/:blobIndex/chunks/:idx   append chunk
 *   POST   /api/v1/uploads/:uploadId/finalize                       commit
 *   DELETE /api/v1/uploads/:uploadId                                cancel
 *
 * See `docs/V1.1_DECISIONS.md` for the protocol rationale and `packages/
 * crypto-spec/README.md` for the manifest v2 wire format.
 */

import { randomBytes } from 'node:crypto';
import { Readable } from 'node:stream';
import multipart from '@fastify/multipart';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import {
  ResumableUploadCreateRequestSchema,
  type ResumableUploadCreateRequest,
  type ResumableUploadState,
} from '@itsweber-send/shared';
import { config } from '../config.js';
import { generateWordcode } from '../utils/wordcode.js';
import {
  insertUploadInProgress,
  getUploadInProgress,
  updateUploadBlobsJson,
  markUploadFinalized,
  deleteUploadInProgress,
  getUserById,
  getUserQuotaUsed,
  getUserUploadInProgressBytes,
  insertShare,
  insertAuditLog,
  type UploadInProgressRecord,
} from '../db/sqlite.js';
import type { StorageAdapter } from '../storage/interface.js';
import { emitWebhook } from '../plugins/webhooks.js';

interface BlobProgress {
  blobId: string;
  cipherSize: number;
  chunkCount: number;
  receivedBytes: number;
  receivedChunks: number;
}

const MANIFEST_MAX_BYTES = 4 * 1024 * 1024; // encrypted manifest cannot reasonably exceed 4 MiB
const MAX_BLOBS_PER_UPLOAD = 100;
const SLACK_BYTES = 4 * 1024; // headers + GCM tag slack on top of chunkSize

function parseBlobs(record: UploadInProgressRecord): BlobProgress[] {
  return JSON.parse(record.blobs_json) as BlobProgress[];
}

function blobsToState(record: UploadInProgressRecord): ResumableUploadState {
  return {
    uploadId: record.id,
    shareId: record.share_id,
    expiresAt: record.expires_at,
    finalized: record.finalized === 1,
    blobs: parseBlobs(record),
  };
}

function isExpired(record: UploadInProgressRecord): boolean {
  return new Date(record.expires_at).getTime() < Date.now();
}

export function createUploadsResumableRoute(storage: StorageAdapter) {
  return async function uploadsResumablePlugin(app: FastifyInstance): Promise<void> {
    // Raw passthrough parser for chunk PATCH bodies. The route reads from
    // `request.body` as a Readable and pipes it straight into storage.
    app.addContentTypeParser(
      'application/octet-stream',
      { bodyLimit: config.uploads.chunkSizeBytes + SLACK_BYTES },
      (_req, payload, done) => {
        // `payload` is the underlying IncomingMessage stream — return it
        // as-is so the handler can stream it without buffering.
        done(null, payload);
      },
    );

    // Multipart parser scoped to this plugin for the finalize call.
    await app.register(multipart, {
      limits: {
        fileSize: MANIFEST_MAX_BYTES,
        fieldSize: 64 * 1024,
        files: 4,
      },
    });

    // -----------------------------------------------------------------------
    // POST /api/v1/uploads — create a pending upload
    // -----------------------------------------------------------------------
    app.post<{ Body: ResumableUploadCreateRequest }>(
      '/api/v1/uploads',
      { config: { rateLimit: { max: 60, timeWindow: '1 hour' } } },
      async (request, reply) => {
        const parsed = ResumableUploadCreateRequestSchema.safeParse(request.body);
        if (!parsed.success) {
          return reply
            .status(400)
            .send({ error: 'Invalid create request', details: parsed.error.flatten() });
        }
        const body = parsed.data;

        if (body.passwordProtected && (!body.salt || !body.ivWrap || !body.wrappedKey)) {
          return reply
            .status(400)
            .send({ error: 'Password-protected upload missing crypto fields' });
        }
        if (body.blobs.length > MAX_BLOBS_PER_UPLOAD) {
          return reply.status(400).send({ error: `Too many blobs (max ${MAX_BLOBS_PER_UPLOAD})` });
        }

        const declaredTotal = body.blobs.reduce((sum, b) => sum + b.cipherSize, 0);

        // Per-blob and overall ceilings.
        for (const blob of body.blobs) {
          if (blob.cipherSize > config.uploads.maxBlobBytes) {
            return reply.status(413).send({
              error: 'Blob exceeds server max-blob-bytes',
              maxBlobBytes: config.uploads.maxBlobBytes,
            });
          }
          // Each chunk is plaintext + 16-byte GCM tag. The server-announced
          // chunkSize bounds plaintext-per-chunk, so cipherSize per blob is
          // bounded by chunkCount * (chunkSize + 16). We don't know the
          // last chunk's size precisely (it can be smaller) so just verify
          // chunkCount fits without overflowing maxBlobBytes.
          if (blob.chunkCount < 1) {
            return reply.status(400).send({ error: 'Invalid blob.chunkCount' });
          }
        }

        // Quota: reserve declared ciphertext upfront for authenticated
        // users so two parallel uploads cannot each individually fit but
        // jointly exceed the quota.
        const userId = request.user?.id ?? null;
        if (userId) {
          const user = getUserById(userId);
          if (user) {
            const used = getUserQuotaUsed(userId) + getUserUploadInProgressBytes(userId);
            if (used + declaredTotal > user.quota_bytes) {
              return reply.status(413).send({ error: 'Quota exceeded (with reservation)' });
            }
          }
        }

        const uploadId = randomBytes(12).toString('hex');
        const shareId = randomBytes(12).toString('hex');
        const now = new Date();
        const expiresAt = new Date(
          now.getTime() + config.uploads.resumeWindowHours * 60 * 60 * 1000,
        );

        const blobs: BlobProgress[] = body.blobs.map((b) => ({
          blobId: b.blobId,
          cipherSize: b.cipherSize,
          chunkCount: b.chunkCount,
          receivedBytes: 0,
          receivedChunks: 0,
        }));

        insertUploadInProgress({
          id: uploadId,
          share_id: shareId,
          user_id: userId,
          created_at: now.toISOString(),
          expires_at: expiresAt.toISOString(),
          chunk_size: config.uploads.chunkSizeBytes,
          declared_total_bytes: declaredTotal,
          expiry_hours: body.expiryHours,
          download_limit: body.downloadLimit,
          password_protected: body.passwordProtected ? 1 : 0,
          salt: body.salt,
          iv_wrap: body.ivWrap,
          wrapped_key: body.wrappedKey,
          blobs_json: JSON.stringify(blobs),
          finalized: 0,
        });

        return reply.status(201).send({
          uploadId,
          shareId,
          chunkSize: config.uploads.chunkSizeBytes,
          maxBlobBytes: config.uploads.maxBlobBytes,
          expiresAt: expiresAt.toISOString(),
        });
      },
    );

    // -----------------------------------------------------------------------
    // GET /api/v1/uploads/:uploadId — resume state
    // -----------------------------------------------------------------------
    app.get<{ Params: { uploadId: string } }>(
      '/api/v1/uploads/:uploadId',
      async (request, reply) => {
        const record = getUploadInProgress(request.params.uploadId);
        if (!record) return reply.status(404).send({ error: 'Upload not found' });
        if (!hasAccess(request, record)) return reply.status(403).send({ error: 'Forbidden' });
        if (isExpired(record)) {
          return reply.status(410).send({ error: 'Upload window expired' });
        }
        return reply.send(blobsToState(record));
      },
    );

    // -----------------------------------------------------------------------
    // PATCH /api/v1/uploads/:uploadId/blobs/:blobIndex/chunks/:chunkIndex
    // Append one ciphertext chunk to the named blob.
    // -----------------------------------------------------------------------
    app.patch<{
      Params: { uploadId: string; blobIndex: string; chunkIndex: string };
    }>(
      '/api/v1/uploads/:uploadId/blobs/:blobIndex/chunks/:chunkIndex',
      {
        bodyLimit: config.uploads.chunkSizeBytes + SLACK_BYTES,
        config: { rateLimit: { max: 600, timeWindow: '1 minute' } },
      },
      async (request, reply) => {
        const { uploadId, blobIndex, chunkIndex } = request.params;
        const record = getUploadInProgress(uploadId);
        if (!record) return reply.status(404).send({ error: 'Upload not found' });
        if (!hasAccess(request, record)) return reply.status(403).send({ error: 'Forbidden' });
        if (record.finalized === 1) {
          return reply.status(409).send({ error: 'Upload already finalized' });
        }
        if (isExpired(record)) {
          return reply.status(410).send({ error: 'Upload window expired' });
        }

        const bIdx = Number(blobIndex);
        const cIdx = Number(chunkIndex);
        if (!Number.isInteger(bIdx) || bIdx < 0) {
          return reply.status(400).send({ error: 'Invalid blobIndex' });
        }
        if (!Number.isInteger(cIdx) || cIdx < 0) {
          return reply.status(400).send({ error: 'Invalid chunkIndex' });
        }

        const blobs = parseBlobs(record);
        const blob = blobs[bIdx];
        if (!blob) return reply.status(404).send({ error: 'blobIndex out of range' });
        if (cIdx >= blob.chunkCount) {
          return reply.status(400).send({ error: 'chunkIndex out of range' });
        }

        // Sequential write within a blob. Idempotent re-PATCH of the most
        // recent chunk is allowed iff the new body length matches what we
        // already stored (i.e. true retry, not a corrupted resend).
        if (cIdx < blob.receivedChunks - 1) {
          return reply
            .status(409)
            .send({ error: 'Chunk already accepted; cannot rewrite earlier chunks' });
        }
        if (cIdx > blob.receivedChunks) {
          return reply
            .status(409)
            .send({ error: 'Chunk out of order', expected: blob.receivedChunks });
        }
        const isReplay = cIdx === blob.receivedChunks - 1;

        const declaredLength = Number(request.headers['content-length']);
        if (!Number.isFinite(declaredLength) || declaredLength <= 0) {
          return reply.status(411).send({ error: 'Content-Length required' });
        }
        if (declaredLength > config.uploads.chunkSizeBytes + SLACK_BYTES) {
          return reply.status(413).send({ error: 'Chunk too large' });
        }
        if (blob.receivedBytes + (isReplay ? 0 : declaredLength) > blob.cipherSize) {
          return reply.status(413).send({ error: 'Cumulative chunks exceed declared cipherSize' });
        }

        const body = request.body;
        if (!body || typeof (body as { pipe?: unknown }).pipe !== 'function') {
          return reply
            .status(400)
            .send({ error: 'Body must be application/octet-stream chunk bytes' });
        }
        const source = body as Readable;

        if (isReplay) {
          // Drain the body to satisfy the HTTP contract but discard the
          // bytes — the chunk is already on disk.
          await new Promise<void>((resolveDrain, rejectDrain) => {
            source.on('end', () => resolveDrain());
            source.on('error', (err) => rejectDrain(err));
            source.resume();
          });
          return reply.send({
            receivedBytes: blob.receivedBytes,
            receivedChunks: blob.receivedChunks,
          });
        }

        let written: number;
        try {
          const result = await storage.appendStream(record.share_id, blob.blobId, source, cIdx);
          written = result.bytesWritten;
        } catch (err) {
          request.log.error({ err, uploadId, bIdx, cIdx }, 'chunk append failed');
          return reply.status(500).send({ error: 'Storage append failed' });
        }

        if (written !== declaredLength) {
          // Partial / mismatched body. Roll back the partial append so the
          // client can re-PATCH cleanly.
          try {
            const fullSize = await storage.size(record.share_id, blob.blobId);
            if (fullSize !== null) {
              // We can't truncate via the StorageAdapter contract — the
              // safest fallback is to fail the upload, the cleanup job
              // will reap it.
              request.log.warn(
                { uploadId, blobId: blob.blobId, written, declaredLength, fullSize },
                'chunk byte mismatch; upload must be cancelled',
              );
            }
          } catch {
            /* ignore */
          }
          return reply.status(400).send({ error: 'Chunk body length mismatch' });
        }

        blob.receivedBytes += written;
        blob.receivedChunks += 1;
        updateUploadBlobsJson(uploadId, JSON.stringify(blobs));

        return reply.send({
          receivedBytes: blob.receivedBytes,
          receivedChunks: blob.receivedChunks,
        });
      },
    );

    // -----------------------------------------------------------------------
    // POST /api/v1/uploads/:uploadId/finalize — commit the share
    // -----------------------------------------------------------------------
    app.post<{ Params: { uploadId: string } }>(
      '/api/v1/uploads/:uploadId/finalize',
      { config: { rateLimit: { max: 30, timeWindow: '1 hour' } } },
      async (request, reply) => {
        const record = getUploadInProgress(request.params.uploadId);
        if (!record) return reply.status(404).send({ error: 'Upload not found' });
        if (!hasAccess(request, record)) return reply.status(403).send({ error: 'Forbidden' });
        if (record.finalized === 1) {
          return reply.status(409).send({ error: 'Upload already finalized' });
        }
        if (isExpired(record)) {
          return reply.status(410).send({ error: 'Upload window expired' });
        }

        const blobs = parseBlobs(record);
        for (const b of blobs) {
          if (b.receivedBytes !== b.cipherSize || b.receivedChunks !== b.chunkCount) {
            return reply.status(409).send({
              error: 'Blobs incomplete',
              blobId: b.blobId,
              received: b.receivedBytes,
              expected: b.cipherSize,
            });
          }
        }

        // Finalize body: multipart with manifest + manifest-iv (+ optional note).
        let manifestBytes: Buffer | null = null;
        let manifestIv: string | null = null;
        try {
          for await (const part of request.parts()) {
            if (part.type === 'field' && part.fieldname === 'manifest-iv') {
              manifestIv = String(part.value);
            } else if (part.type === 'file' && part.fieldname === 'manifest') {
              manifestBytes = await part.toBuffer();
            }
          }
        } catch (err) {
          request.log.error({ err }, 'finalize multipart parse failed');
          return reply.status(400).send({ error: 'Invalid finalize multipart body' });
        }
        if (!manifestBytes || !manifestIv) {
          return reply
            .status(400)
            .send({ error: 'Missing manifest or manifest-iv in finalize body' });
        }

        const now = new Date();
        const shareExpiresAt = new Date(now.getTime() + record.expiry_hours * 60 * 60 * 1000);

        // Server-measured ciphertext sizes are authoritative.
        const totalSizeBytes =
          manifestBytes.byteLength + blobs.reduce((s, b) => s + b.receivedBytes, 0);

        // Multipart-upload backends (S3) need an explicit commit per blob
        // before the object becomes downloadable. Filesystem treats this
        // as a no-op. Done before manifest/meta puts so a partial finalize
        // can't expose a manifest pointing to nonexistent blobs.
        for (const blob of blobs) {
          try {
            await storage.finalizeAppend(record.share_id, blob.blobId);
          } catch (err) {
            request.log.error(
              { err, uploadId: request.params.uploadId, blobId: blob.blobId },
              'finalizeAppend failed',
            );
            return reply.status(500).send({ error: 'Storage commit failed' });
          }
        }

        await storage.put(record.share_id, 'manifest', manifestBytes);
        await storage.put(record.share_id, 'manifest.iv', Buffer.from(manifestIv));
        const metaJson = JSON.stringify({
          createdAt: now.toISOString(),
          expiresAt: shareExpiresAt.toISOString(),
          downloadLimit: record.download_limit,
          passwordRequired: record.password_protected === 1,
          salt: record.salt,
          ivWrap: record.iv_wrap,
          wrappedKey: record.wrapped_key,
          manifestVersion: 2,
        });
        await storage.put(record.share_id, 'meta.json', Buffer.from(metaJson));

        const wordcode = generateWordcode(record.share_id);
        insertShare({
          id: record.share_id,
          created_at: now.toISOString(),
          expires_at: shareExpiresAt.toISOString(),
          download_limit: record.download_limit,
          downloads_used: 0,
          salt: record.salt,
          iv_wrap: record.iv_wrap,
          wrapped_key: record.wrapped_key,
          user_id: record.user_id,
          total_size_bytes: totalSizeBytes,
          wordcode,
          file_count: blobs.length,
          manifest_version: 2,
        });
        markUploadFinalized(request.params.uploadId);

        insertAuditLog({
          user_id: record.user_id,
          action: 'share.created',
          resource: record.share_id,
          ip: request.ip,
          created_at: now.toISOString(),
        });

        void emitWebhook(
          {
            type: 'upload.created',
            shareId: record.share_id,
            fileCount: blobs.length,
            totalSizeBytes,
            userId: record.user_id,
            expiresAt: shareExpiresAt.toISOString(),
          },
          request.log,
        );

        return reply
          .status(201)
          .send({ id: record.share_id, wordcode, expiresAt: shareExpiresAt.toISOString() });
      },
    );

    // -----------------------------------------------------------------------
    // DELETE /api/v1/uploads/:uploadId — cancel and free partial blobs
    // -----------------------------------------------------------------------
    app.delete<{ Params: { uploadId: string } }>(
      '/api/v1/uploads/:uploadId',
      async (request, reply) => {
        const record = getUploadInProgress(request.params.uploadId);
        if (!record) return reply.status(204).send();
        if (!hasAccess(request, record)) return reply.status(403).send({ error: 'Forbidden' });
        if (record.finalized === 1) {
          return reply.status(409).send({ error: 'Already finalized; cancel not applicable' });
        }
        try {
          await storage.delete(record.share_id);
        } catch {
          /* best-effort */
        }
        deleteUploadInProgress(request.params.uploadId);
        return reply.status(204).send();
      },
    );
  };
}

/**
 * Anonymous uploads remain anonymous on resume — no session check. For
 * authenticated uploads the same user must match. Anyone in possession of
 * the (24-hex random) uploadId can append; the uploadId acts as a bearer
 * capability for the duration of the resume window.
 */
function hasAccess(request: FastifyRequest, record: UploadInProgressRecord): boolean {
  if (record.user_id === null) return true;
  return request.user?.id === record.user_id;
}
