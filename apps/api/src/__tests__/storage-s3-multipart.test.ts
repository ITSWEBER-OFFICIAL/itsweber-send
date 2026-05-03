/**
 * S3 multipart adapter integration tests.
 *
 * These tests run against a real S3-compatible service (MinIO is the
 * reference). They are gated by `S3_TEST_ENDPOINT`: when the variable is
 * unset the suite is skipped so the default `pnpm test` run on a
 * developer machine without MinIO stays green.
 *
 * To run locally:
 *
 *   docker run --rm -d --name minio-test -p 9000:9000 -p 9001:9001 \
 *     -e MINIO_ROOT_USER=minioadmin -e MINIO_ROOT_PASSWORD=minioadmin \
 *     minio/minio server /data
 *
 *   S3_TEST_ENDPOINT=http://127.0.0.1:9000 \
 *   S3_TEST_BUCKET=itsweber-send-test \
 *   AWS_ACCESS_KEY_ID=minioadmin \
 *   AWS_SECRET_ACCESS_KEY=minioadmin \
 *   pnpm --filter @itsweber-send/api test
 *
 * The bucket is created by the test setup if it does not already exist.
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { Readable } from 'node:stream';
import { randomBytes } from 'node:crypto';
import {
  CreateBucketCommand,
  HeadBucketCommand,
  ListMultipartUploadsCommand,
  ListObjectsV2Command,
  S3Client,
} from '@aws-sdk/client-s3';
import { S3Storage } from '../storage/s3.js';

const endpoint = process.env.S3_TEST_ENDPOINT;
const bucket = process.env.S3_TEST_BUCKET ?? 'itsweber-send-test';
const region = process.env.S3_TEST_REGION ?? 'us-east-1';
const enabled = Boolean(endpoint);

// Use describe.skipIf so the suite shows as skipped (not absent) when the
// MinIO endpoint is unset. This keeps the test inventory honest in CI logs.
const d = enabled ? describe : describe.skip;

// AWS SDK reads AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY from env. For
// MinIO defaults we don't need to override, but we set them here so a
// developer can run with explicit S3_TEST_* vars and have it work.
if (enabled) {
  process.env.AWS_ACCESS_KEY_ID ??= process.env.MINIO_ROOT_USER ?? 'minioadmin';
  process.env.AWS_SECRET_ACCESS_KEY ??= process.env.MINIO_ROOT_PASSWORD ?? 'minioadmin';
}

const client = enabled
  ? new S3Client({ endpoint, region, forcePathStyle: true })
  : (null as unknown as S3Client);

async function ensureBucket(): Promise<void> {
  try {
    await client.send(new HeadBucketCommand({ Bucket: bucket }));
  } catch {
    await client.send(new CreateBucketCommand({ Bucket: bucket }));
  }
}

async function readAll(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as ArrayBufferLike));
  }
  return Buffer.concat(chunks);
}

function newShareId(): string {
  return `test-${randomBytes(8).toString('hex')}`;
}

d('S3Storage multipart resumable adapter', () => {
  let storage: S3Storage;
  let shareId: string;

  beforeAll(async () => {
    await ensureBucket();
  }, 30_000);

  beforeEach(() => {
    storage = new S3Storage(bucket, { endpoint, region, forcePathStyle: true });
    shareId = newShareId();
  });

  afterEach(async () => {
    try {
      await storage.delete(shareId);
    } catch {
      // best-effort
    }
  });

  it('uploads three parts (each ≥ 5 MiB except the last) and reassembles them on download', async () => {
    // Two full 5 MiB parts followed by a smaller tail. S3 requires every
    // part except the last to be at least 5 MiB.
    const a = randomBytes(5 * 1024 * 1024);
    const b = randomBytes(5 * 1024 * 1024);
    const c = randomBytes(1024 * 1024);
    const r1 = await storage.appendStream(shareId, 'blob-0001', Readable.from([a]), 0);
    const r2 = await storage.appendStream(shareId, 'blob-0001', Readable.from([b]), 1);
    const r3 = await storage.appendStream(shareId, 'blob-0001', Readable.from([c]), 2);
    expect(r1.bytesWritten).toBe(a.byteLength);
    expect(r2.bytesWritten).toBe(b.byteLength);
    expect(r3.bytesWritten).toBe(c.byteLength);

    // Before finalize the object does not exist yet.
    expect(await storage.size(shareId, 'blob-0001')).toBeNull();

    await storage.finalizeAppend(shareId, 'blob-0001');

    // After finalize the object size matches the sum of all parts.
    const total = a.byteLength + b.byteLength + c.byteLength;
    expect(await storage.size(shareId, 'blob-0001')).toBe(total);

    const stream = await storage.getStream(shareId, 'blob-0001');
    const out = await readAll(stream);
    expect(out.byteLength).toBe(total);
    expect(out.subarray(0, a.byteLength)).toEqual(a);
    expect(out.subarray(a.byteLength, a.byteLength + b.byteLength)).toEqual(b);
    expect(out.subarray(a.byteLength + b.byteLength)).toEqual(c);
  }, 120_000);

  it('survives a process restart mid-upload by recovering the open multipart from S3', async () => {
    const a = randomBytes(5 * 1024 * 1024);
    const b = randomBytes(5 * 1024 * 1024);

    // First "process" uploads two parts.
    const adapter1 = new S3Storage(bucket, { endpoint, region, forcePathStyle: true });
    await adapter1.appendStream(shareId, 'blob-0001', Readable.from([a]), 0);
    await adapter1.appendStream(shareId, 'blob-0001', Readable.from([b]), 1);

    // Simulate a restart: throw the adapter (and its in-memory cache)
    // away. The multipart is still open in S3; the new adapter instance
    // must recover the UploadId and parts list.
    const adapter2 = new S3Storage(bucket, { endpoint, region, forcePathStyle: true });
    const c = randomBytes(1024 * 1024);
    await adapter2.appendStream(shareId, 'blob-0001', Readable.from([c]), 2);
    await adapter2.finalizeAppend(shareId, 'blob-0001');

    const total = a.byteLength + b.byteLength + c.byteLength;
    expect(await adapter2.size(shareId, 'blob-0001')).toBe(total);
    const stream = await adapter2.getStream(shareId, 'blob-0001');
    const out = await readAll(stream);
    expect(out.byteLength).toBe(total);
  }, 180_000);

  it('idempotent re-PATCH of the same part replaces the ETag without growing the part list', async () => {
    const a = randomBytes(5 * 1024 * 1024);
    const aPrime = randomBytes(5 * 1024 * 1024);
    const b = randomBytes(1024 * 1024);

    // First write of part 1.
    await storage.appendStream(shareId, 'blob-0001', Readable.from([a]), 0);
    // Replay of the same part with different bytes — adapter should
    // overwrite, not append.
    await storage.appendStream(shareId, 'blob-0001', Readable.from([aPrime]), 0);
    // Genuine next part.
    await storage.appendStream(shareId, 'blob-0001', Readable.from([b]), 1);
    await storage.finalizeAppend(shareId, 'blob-0001');

    const out = await readAll(await storage.getStream(shareId, 'blob-0001'));
    expect(out.byteLength).toBe(aPrime.byteLength + b.byteLength);
    expect(out.subarray(0, aPrime.byteLength)).toEqual(aPrime);
    expect(out.subarray(aPrime.byteLength)).toEqual(b);
  }, 120_000);

  it('serves Range requests on a finalized multipart object', async () => {
    const a = randomBytes(5 * 1024 * 1024);
    const b = randomBytes(1024 * 1024);
    await storage.appendStream(shareId, 'blob-0001', Readable.from([a]), 0);
    await storage.appendStream(shareId, 'blob-0001', Readable.from([b]), 1);
    await storage.finalizeAppend(shareId, 'blob-0001');

    const total = a.byteLength + b.byteLength;
    // First 1 KiB
    const head = await readAll(
      await storage.getStream(shareId, 'blob-0001', { start: 0, end: 1023 }),
    );
    expect(head.byteLength).toBe(1024);
    expect(head).toEqual(a.subarray(0, 1024));

    // Last 1 KiB
    const tail = await readAll(
      await storage.getStream(shareId, 'blob-0001', { start: total - 1024, end: total - 1 }),
    );
    expect(tail.byteLength).toBe(1024);
    expect(tail).toEqual(b.subarray(b.byteLength - 1024));
  }, 120_000);

  it('delete aborts open multipart uploads and clears completed objects under the share prefix', async () => {
    // Open one multipart upload across two blobs, leave both pending.
    const a = randomBytes(5 * 1024 * 1024);
    const b = randomBytes(5 * 1024 * 1024);
    await storage.appendStream(shareId, 'blob-0001', Readable.from([a]), 0);
    await storage.appendStream(shareId, 'blob-0002', Readable.from([b]), 0);
    // Also write a small committed object under the prefix to exercise
    // the second branch of delete().
    await storage.put(shareId, 'meta.json', Buffer.from('{}'));

    await storage.delete(shareId);

    // After delete: no open multiparts under the share's prefix anywhere
    // in the bucket. We list bucket-wide (no Prefix) because MinIO's
    // ListMultipartUploads ignores partial Prefix filters; the assertion
    // does the prefix match client-side.
    let afterToken: string | undefined;
    let afterUploadIdToken: string | undefined;
    const stillOpen: string[] = [];
    do {
      const r = await client.send(
        new ListMultipartUploadsCommand({
          Bucket: bucket,
          KeyMarker: afterToken,
          UploadIdMarker: afterUploadIdToken,
        }),
      );
      for (const u of r.Uploads ?? []) {
        if (u.Key?.startsWith(`${shareId}/`)) stillOpen.push(u.Key);
      }
      afterToken = r.IsTruncated ? r.NextKeyMarker : undefined;
      afterUploadIdToken = r.IsTruncated ? r.NextUploadIdMarker : undefined;
    } while (afterToken);
    expect(stillOpen).toHaveLength(0);

    // No committed objects either (ListObjectsV2's Prefix works correctly
    // on both AWS S3 and MinIO).
    const afterObj = await client.send(
      new ListObjectsV2Command({ Bucket: bucket, Prefix: `${shareId}/` }),
    );
    expect(afterObj.Contents ?? []).toHaveLength(0);
  }, 60_000);

  it('rejects a chunkIndex that would exceed the S3 10 000-parts ceiling', async () => {
    await expect(
      storage.appendStream(
        shareId,
        'blob-0001',
        Readable.from([Buffer.alloc(1024)]),
        10000, // PartNumber would be 10001
      ),
    ).rejects.toThrow(/10000/);
  }, 30_000);

  it('throws when chunkIndex is missing or invalid', async () => {
    await expect(
      storage.appendStream(shareId, 'blob-0001', Readable.from([Buffer.alloc(1024)])),
    ).rejects.toThrow(/chunkIndex/);
  });
});
