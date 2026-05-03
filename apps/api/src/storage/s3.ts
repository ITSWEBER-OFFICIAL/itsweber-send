/**
 * S3-compatible storage adapter for ITSWEBER Send.
 *
 * Supports both the legacy single-shot path (PUT/GET) and the v1.1
 * resumable chunked-upload path via S3 multipart uploads. The multipart
 * implementation persists no extra state in the application database —
 * the S3 service itself is the source of truth for in-flight uploads:
 *
 *   - Each blob (one file in the share) maps to one S3 multipart upload,
 *     keyed by `<shareId>/<blobId>`.
 *   - On the first `appendStream` call for a (shareId, blobId), the
 *     adapter calls `CreateMultipartUploadCommand` and caches the
 *     returned `UploadId` in memory.
 *   - On subsequent calls, the cached UploadId is reused; `chunkIndex` is
 *     translated to `PartNumber = chunkIndex + 1`.
 *   - On process restart mid-upload the cache is empty; the adapter
 *     transparently recovers by calling `ListMultipartUploadsCommand`
 *     filtered by prefix to find the open UploadId, then `ListPartsCommand`
 *     for the current parts. The Resumable upload route's existing
 *     receivedBytes / receivedChunks counters in `uploads_in_progress`
 *     drive the client's resume position.
 *   - `finalizeAppend` lists all parts and calls
 *     `CompleteMultipartUploadCommand`. Idempotent: re-calls after a
 *     completed upload no-op.
 *   - `delete(shareId)` aborts every open multipart under the share's
 *     prefix in addition to deleting completed objects, so cancellation
 *     never leaks billable in-flight uploads.
 *
 * Per-chunk bodies are buffered into a Buffer before `UploadPartCommand`.
 * The chunk size is bounded by `CHUNK_SIZE_BYTES` (default 16 MiB), so
 * the transient buffer is small enough to be safe even on small hosts.
 *
 * S3 multipart constraints (5 MiB minimum part size except the last,
 * 10 000 maximum parts, 5 GiB maximum part size) are documented in
 * `docs/LARGE_FILES.md` and enforced server-side by the resumable route's
 * boot-time configuration validation in `server.ts`.
 */

import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  DeleteObjectsCommand,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
  ListMultipartUploadsCommand,
  ListPartsCommand,
} from '@aws-sdk/client-s3';
import type { Readable } from 'node:stream';
import type { StorageAdapter } from './interface.js';

function key(shareId: string, name: string): string {
  return `${shareId}/${name}`;
}

async function streamToBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as any));
  }
  return Buffer.concat(chunks);
}

interface PartRecord {
  partNumber: number;
  etag: string;
}

interface MultipartState {
  uploadId: string;
  parts: PartRecord[];
}

export class S3Storage implements StorageAdapter {
  private readonly client: S3Client;

  /**
   * In-memory cache of open multipart uploads keyed by full S3 key
   * (`<shareId>/<blobId>`). Populated lazily either by `CreateMultipartUpload`
   * or by recovery (`ListMultipartUploads` + `ListParts`). Invalidated on
   * `finalizeAppend` (success) and on `abort` paths inside `delete`.
   */
  private readonly multipartState = new Map<string, MultipartState>();

  constructor(
    private readonly bucket: string,
    options: {
      endpoint?: string;
      region?: string;
      forcePathStyle?: boolean;
    } = {},
  ) {
    this.client = new S3Client({
      region: options.region ?? 'us-east-1',
      ...(options.endpoint ? { endpoint: options.endpoint } : {}),
      forcePathStyle: options.forcePathStyle ?? false,
    });
  }

  async put(shareId: string, name: string, data: Buffer): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key(shareId, name),
        Body: data,
      }),
    );
  }

  async get(shareId: string, name: string): Promise<Buffer> {
    const response = await this.client.send(
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: key(shareId, name),
      }),
    );
    if (!response.Body) {
      throw new Error(`Empty response body for ${key(shareId, name)}`);
    }
    return streamToBuffer(response.Body as NodeJS.ReadableStream);
  }

  async exists(shareId: string): Promise<boolean> {
    try {
      await this.client.send(
        new HeadObjectCommand({
          Bucket: this.bucket,
          Key: key(shareId, 'meta.json'),
        }),
      );
      return true;
    } catch {
      return false;
    }
  }

  async delete(shareId: string): Promise<void> {
    const prefix = `${shareId}/`;

    // 1. Abort every open multipart upload under this prefix so we never
    //    leak billable in-flight parts. Done before object deletion in case
    //    a caller races with us.
    //
    // NOTE: MinIO's ListMultipartUploads ignores the Prefix parameter for
    //       partial matches — only an exact full-Key prefix returns
    //       results. Real S3 honours the prefix correctly. To stay
    //       correct on both, we list every open multipart in the bucket
    //       and filter client-side by Key.startsWith(prefix). This is fine
    //       for typical bucket cardinality; on very busy shared buckets it
    //       could be tuned by paginating with Prefix on real S3 and
    //       falling back to a no-prefix scan only when the result is
    //       suspiciously empty, but the simple form is robust.
    let multipartToken: string | undefined;
    let multipartUploadIdToken: string | undefined;
    do {
      const list = await this.client.send(
        new ListMultipartUploadsCommand({
          Bucket: this.bucket,
          KeyMarker: multipartToken,
          UploadIdMarker: multipartUploadIdToken,
        }),
      );
      for (const upload of list.Uploads ?? []) {
        if (!upload.Key || !upload.UploadId) continue;
        if (!upload.Key.startsWith(prefix)) continue;
        try {
          await this.client.send(
            new AbortMultipartUploadCommand({
              Bucket: this.bucket,
              Key: upload.Key,
              UploadId: upload.UploadId,
            }),
          );
        } catch {
          // best effort — cleanup job will sweep again
        }
        this.multipartState.delete(upload.Key);
      }
      multipartToken = list.IsTruncated ? list.NextKeyMarker : undefined;
      multipartUploadIdToken = list.IsTruncated ? list.NextUploadIdMarker : undefined;
    } while (multipartToken);

    // 2. Delete every committed object under the prefix.
    let continuationToken: string | undefined;
    do {
      const list = await this.client.send(
        new ListObjectsV2Command({
          Bucket: this.bucket,
          Prefix: prefix,
          ContinuationToken: continuationToken,
        }),
      );

      const objects = list.Contents?.map((o) => ({ Key: o.Key! })) ?? [];
      if (objects.length > 0) {
        await this.client.send(
          new DeleteObjectsCommand({
            Bucket: this.bucket,
            Delete: { Objects: objects, Quiet: true },
          }),
        );
      }

      continuationToken = list.IsTruncated ? list.NextContinuationToken : undefined;
    } while (continuationToken);
  }

  async expireBefore(cutoff: Date): Promise<string[]> {
    const expired: string[] = [];
    let continuationToken: string | undefined;

    // List only meta.json objects — one per share, minimal data transfer.
    do {
      const list = await this.client.send(
        new ListObjectsV2Command({
          Bucket: this.bucket,
          ContinuationToken: continuationToken,
        }),
      );

      const metaKeys = (list.Contents ?? [])
        .map((o) => o.Key!)
        .filter((k) => k.endsWith('/meta.json'));

      for (const metaKey of metaKeys) {
        try {
          const resp = await this.client.send(
            new GetObjectCommand({ Bucket: this.bucket, Key: metaKey }),
          );
          const raw = (await streamToBuffer(resp.Body as NodeJS.ReadableStream)).toString('utf8');
          const meta = JSON.parse(raw) as { expiresAt?: string };
          if (meta.expiresAt && new Date(meta.expiresAt) < cutoff) {
            expired.push(metaKey.replace('/meta.json', ''));
          }
        } catch {
          // Skip unreadable objects
        }
      }

      continuationToken = list.IsTruncated ? list.NextContinuationToken : undefined;
    } while (continuationToken);

    return expired;
  }

  async appendStream(
    shareId: string,
    name: string,
    source: Readable,
    chunkIndex?: number,
  ): Promise<{ bytesWritten: number }> {
    if (chunkIndex === undefined || chunkIndex < 0 || !Number.isInteger(chunkIndex)) {
      throw new Error('S3Storage.appendStream requires an integer chunkIndex >= 0');
    }
    // S3 PartNumber is 1-based, capped at 10 000 by the protocol.
    const partNumber = chunkIndex + 1;
    if (partNumber > 10000) {
      throw new Error(
        `S3 multipart parts limit reached (PartNumber ${partNumber} > 10000). ` +
          'Increase CHUNK_SIZE_BYTES or use the filesystem backend for files larger than ' +
          '10 000 × CHUNK_SIZE_BYTES.',
      );
    }

    const k = key(shareId, name);
    const state = await this.ensureMultipartState(k);

    // Buffer the chunk into memory so we can hand UploadPart a Buffer with
    // a known Content-Length. The chunk is bounded by CHUNK_SIZE_BYTES so
    // this is small (~16 MiB by default).
    const body = await streamToBuffer(source);

    const result = await this.client.send(
      new UploadPartCommand({
        Bucket: this.bucket,
        Key: k,
        UploadId: state.uploadId,
        PartNumber: partNumber,
        Body: body,
        ContentLength: body.byteLength,
      }),
    );
    if (!result.ETag) {
      throw new Error(`UploadPart for ${k} part ${partNumber} returned no ETag`);
    }

    // Replace if same partNumber already exists (idempotent retry), else
    // append. Keep parts sorted by partNumber for CompleteMultipartUpload.
    const existingIdx = state.parts.findIndex((p) => p.partNumber === partNumber);
    const record: PartRecord = { partNumber, etag: result.ETag };
    if (existingIdx >= 0) {
      state.parts[existingIdx] = record;
    } else {
      state.parts.push(record);
      state.parts.sort((a, b) => a.partNumber - b.partNumber);
    }

    return { bytesWritten: body.byteLength };
  }

  async finalizeAppend(shareId: string, name: string): Promise<void> {
    const k = key(shareId, name);
    const cached = this.multipartState.get(k);

    let uploadId: string;
    let parts: PartRecord[];

    if (cached) {
      uploadId = cached.uploadId;
      parts = [...cached.parts];
    } else {
      // No cached state. Either (a) finalize was called twice and the
      // multipart already completed, in which case HEAD succeeds and we
      // no-op, or (b) we lost cache after a restart and must recover.
      const headOk = await this.headObject(k);
      if (headOk) return;
      const recovered = await this.recoverMultipartState(k);
      if (!recovered) {
        throw new Error(`finalizeAppend: no multipart upload and no committed object for ${k}`);
      }
      uploadId = recovered.uploadId;
      parts = [...recovered.parts];
    }

    if (parts.length === 0) {
      throw new Error(`finalizeAppend: no parts uploaded for ${k}`);
    }

    parts.sort((a, b) => a.partNumber - b.partNumber);
    await this.client.send(
      new CompleteMultipartUploadCommand({
        Bucket: this.bucket,
        Key: k,
        UploadId: uploadId,
        MultipartUpload: {
          Parts: parts.map((p) => ({ PartNumber: p.partNumber, ETag: p.etag })),
        },
      }),
    );
    this.multipartState.delete(k);
  }

  async size(shareId: string, name: string): Promise<number | null> {
    try {
      const head = await this.client.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: key(shareId, name) }),
      );
      return head.ContentLength ?? null;
    } catch {
      return null;
    }
  }

  async listShareIds(): Promise<string[]> {
    const ids = new Set<string>();
    let token: string | undefined;
    do {
      const list = await this.client.send(
        new ListObjectsV2Command({
          Bucket: this.bucket,
          Delimiter: '/',
          ContinuationToken: token,
        }),
      );
      for (const cp of list.CommonPrefixes ?? []) {
        // CommonPrefixes look like "<shareId>/" — strip the trailing slash.
        if (cp.Prefix && cp.Prefix.endsWith('/')) {
          ids.add(cp.Prefix.slice(0, -1));
        }
      }
      token = list.IsTruncated ? list.NextContinuationToken : undefined;
    } while (token);
    return Array.from(ids);
  }

  async getStream(
    shareId: string,
    name: string,
    range?: { start: number; end?: number },
  ): Promise<Readable> {
    const cmd = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key(shareId, name),
      ...(range
        ? {
            Range:
              typeof range.end === 'number'
                ? `bytes=${range.start}-${range.end}`
                : `bytes=${range.start}-`,
          }
        : {}),
    });
    const response = await this.client.send(cmd);
    if (!response.Body) {
      throw new Error(`Empty response body for ${key(shareId, name)}`);
    }
    return response.Body as Readable;
  }

  // ---------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------

  /**
   * Get or create the multipart state for a key. On the first call we
   * try to recover an existing in-flight upload (after a process restart);
   * if none exists, we create one fresh.
   */
  private async ensureMultipartState(k: string): Promise<MultipartState> {
    const cached = this.multipartState.get(k);
    if (cached) return cached;

    const recovered = await this.recoverMultipartState(k);
    if (recovered) {
      this.multipartState.set(k, recovered);
      return recovered;
    }

    const created = await this.client.send(
      new CreateMultipartUploadCommand({
        Bucket: this.bucket,
        Key: k,
      }),
    );
    if (!created.UploadId) {
      throw new Error(`CreateMultipartUpload for ${k} returned no UploadId`);
    }
    const fresh: MultipartState = { uploadId: created.UploadId, parts: [] };
    this.multipartState.set(k, fresh);
    return fresh;
  }

  /**
   * Look for an existing in-flight multipart upload for this key and, if
   * found, ListParts to populate the parts cache. Returns null if no open
   * multipart exists for this key.
   */
  private async recoverMultipartState(k: string): Promise<MultipartState | null> {
    let token: string | undefined;
    let uploadIdToken: string | undefined;
    let foundUploadId: string | null = null;

    // ListMultipartUploads is bucket-wide with optional prefix; iterate
    // until we find a match for the exact key.
    do {
      const list = await this.client.send(
        new ListMultipartUploadsCommand({
          Bucket: this.bucket,
          Prefix: k,
          KeyMarker: token,
          UploadIdMarker: uploadIdToken,
        }),
      );
      for (const u of list.Uploads ?? []) {
        if (u.Key === k && u.UploadId) {
          foundUploadId = u.UploadId;
          break;
        }
      }
      if (foundUploadId) break;
      token = list.IsTruncated ? list.NextKeyMarker : undefined;
      uploadIdToken = list.IsTruncated ? list.NextUploadIdMarker : undefined;
    } while (token);

    if (!foundUploadId) return null;

    const parts: PartRecord[] = [];
    let partsToken: number | undefined;
    do {
      const list = await this.client.send(
        new ListPartsCommand({
          Bucket: this.bucket,
          Key: k,
          UploadId: foundUploadId,
          PartNumberMarker: partsToken !== undefined ? String(partsToken) : undefined,
        }),
      );
      for (const p of list.Parts ?? []) {
        if (typeof p.PartNumber === 'number' && p.ETag) {
          parts.push({ partNumber: p.PartNumber, etag: p.ETag });
        }
      }
      partsToken = list.IsTruncated
        ? Number(list.NextPartNumberMarker ?? '0') || undefined
        : undefined;
    } while (partsToken !== undefined);

    parts.sort((a, b) => a.partNumber - b.partNumber);
    return { uploadId: foundUploadId, parts };
  }

  private async headObject(k: string): Promise<boolean> {
    try {
      await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: k }));
      return true;
    } catch {
      return false;
    }
  }
}
