// @vitest-environment node
// Node 22 exposes Web Crypto, ReadableStream, and WritableStream globally.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  buildV2PlaintextStream,
  streamShareAsZip,
  supportsFileSystemAccess,
  type DecodedManifest,
  type ZipProgress,
} from '../zip.js';
import { generateKey, generateIV, encrypt, toBase64url } from '../../crypto/index.js';
import type { ManifestV2 } from '@itsweber-send/shared';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface EncryptedChunk {
  cipher: Uint8Array<ArrayBuffer>;
  iv: string; // base64url
  cipherSize: number;
}

async function encryptChunkBytes(
  key: CryptoKey,
  plaintext: Uint8Array<ArrayBuffer>,
): Promise<EncryptedChunk> {
  const iv = generateIV();
  const cipher = await encrypt(key, iv, plaintext);
  return { cipher, iv: toBase64url(iv), cipherSize: cipher.byteLength };
}

function concatBytes(parts: Uint8Array[]): Uint8Array<ArrayBuffer> {
  let total = 0;
  for (const p of parts) total += p.byteLength;
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.byteLength;
  }
  return out;
}

function makeResponse(body: Uint8Array<ArrayBuffer>): Response {
  return new Response(body, {
    status: 200,
    headers: { 'content-type': 'application/octet-stream' },
  });
}

function fetchMockReturning(body: Uint8Array<ArrayBuffer>): typeof fetch {
  return vi.fn(async () => makeResponse(body)) as unknown as typeof fetch;
}

async function drainStream(stream: ReadableStream<Uint8Array>): Promise<Uint8Array<ArrayBuffer>> {
  const reader = stream.getReader();
  const parts: Uint8Array[] = [];
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    if (value) parts.push(value);
  }
  return concatBytes(parts);
}

function makeMemorySink(): { writable: WritableStream<Uint8Array>; bytes: () => Uint8Array } {
  const chunks: Uint8Array[] = [];
  const writable = new WritableStream<Uint8Array>({
    write(chunk) {
      chunks.push(chunk);
    },
  });
  return { writable, bytes: () => concatBytes(chunks) };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('supportsFileSystemAccess', () => {
  it('returns false in a node test environment where showSaveFilePicker is missing', () => {
    expect(supportsFileSystemAccess()).toBe(false);
  });

  it('returns true when showSaveFilePicker is present on globalThis', () => {
    const g = globalThis as { showSaveFilePicker?: unknown };
    g.showSaveFilePicker = () => Promise.resolve({});
    try {
      expect(supportsFileSystemAccess()).toBe(true);
    } finally {
      delete g.showSaveFilePicker;
    }
  });
});

describe('buildV2PlaintextStream', () => {
  let originalFetch: typeof fetch;
  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('decrypts a multi-chunk blob and emits the original plaintext in order', async () => {
    const key = await generateKey();
    const plaintexts = [
      crypto.getRandomValues(new Uint8Array(64)),
      crypto.getRandomValues(new Uint8Array(96)),
      crypto.getRandomValues(new Uint8Array(32)),
    ];
    const encrypted: EncryptedChunk[] = [];
    for (const p of plaintexts) {
      encrypted.push(await encryptChunkBytes(key, p));
    }
    const blob = concatBytes(encrypted.map((c) => c.cipher));
    globalThis.fetch = fetchMockReturning(blob);

    const stream = buildV2PlaintextStream(
      'share-x',
      1,
      encrypted.map((c) => ({ iv: c.iv, cipherSize: c.cipherSize })),
      key,
    );
    const decrypted = await drainStream(stream);
    expect(decrypted).toEqual(concatBytes(plaintexts));
  });

  it('errors the stream when the auth tag fails (wrong IV)', async () => {
    const key = await generateKey();
    const plain = crypto.getRandomValues(new Uint8Array(48));
    const enc = await encryptChunkBytes(key, plain);
    globalThis.fetch = fetchMockReturning(enc.cipher);

    // Swap the IV with a fresh random one — auth tag will fail
    const wrongIv = toBase64url(generateIV());
    const stream = buildV2PlaintextStream(
      'share-x',
      1,
      [{ iv: wrongIv, cipherSize: enc.cipherSize }],
      key,
    );
    await expect(drainStream(stream)).rejects.toBeDefined();
  });

  it('errors the stream when the server delivers fewer bytes than declared', async () => {
    const key = await generateKey();
    const plain = crypto.getRandomValues(new Uint8Array(48));
    const enc = await encryptChunkBytes(key, plain);
    // Truncate the cipher
    globalThis.fetch = fetchMockReturning(enc.cipher.subarray(0, enc.cipher.byteLength - 8));

    const stream = buildV2PlaintextStream(
      'share-x',
      1,
      [{ iv: enc.iv, cipherSize: enc.cipherSize }],
      key,
    );
    await expect(drainStream(stream)).rejects.toThrow(/[Tt]runcated/);
  });

  it('errors the stream when the server delivers MORE bytes than declared', async () => {
    const key = await generateKey();
    const plain = crypto.getRandomValues(new Uint8Array(32));
    const enc = await encryptChunkBytes(key, plain);
    const trailing = new Uint8Array(8);
    crypto.getRandomValues(trailing);
    const padded = concatBytes([enc.cipher, trailing]);
    globalThis.fetch = fetchMockReturning(padded);

    const stream = buildV2PlaintextStream(
      'share-x',
      1,
      [{ iv: enc.iv, cipherSize: enc.cipherSize }],
      key,
    );
    await expect(drainStream(stream)).rejects.toThrow(/[Tt]railing/);
  });

  it('handles blobs delivered as multiple small reads (fragmented Response body)', async () => {
    const key = await generateKey();
    const plaintexts = [
      crypto.getRandomValues(new Uint8Array(80)),
      crypto.getRandomValues(new Uint8Array(80)),
    ];
    const encrypted: EncryptedChunk[] = [];
    for (const p of plaintexts) encrypted.push(await encryptChunkBytes(key, p));
    const blob = concatBytes(encrypted.map((c) => c.cipher));

    // Build a response whose body emits 17-byte chunks to simulate
    // network fragmentation across our manifest-declared chunk boundaries.
    const fragmented = new ReadableStream<Uint8Array>({
      start(controller) {
        const step = 17;
        for (let off = 0; off < blob.byteLength; off += step) {
          controller.enqueue(blob.slice(off, Math.min(off + step, blob.byteLength)));
        }
        controller.close();
      },
    });
    globalThis.fetch = vi.fn(async () => new Response(fragmented)) as unknown as typeof fetch;

    const stream = buildV2PlaintextStream(
      'share-x',
      1,
      encrypted.map((c) => ({ iv: c.iv, cipherSize: c.cipherSize })),
      key,
    );
    const decrypted = await drainStream(stream);
    expect(decrypted).toEqual(concatBytes(plaintexts));
  });
});

describe('streamShareAsZip', () => {
  let originalFetch: typeof fetch;
  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('emits a ZIP archive with the expected magic, names, and progress callbacks', async () => {
    const key = await generateKey();

    const fileA = crypto.getRandomValues(new Uint8Array(50));
    const fileB = crypto.getRandomValues(new Uint8Array(70));
    const encA = await encryptChunkBytes(key, fileA);
    const encB = await encryptChunkBytes(key, fileB);

    // Mock fetch by URL → blob ciphertext. blob-0001 and blob-0002.
    const fetchMock = vi.fn(async (url: string | URL | Request) => {
      const u = typeof url === 'string' ? url : (url as URL).toString();
      if (u.endsWith('/blob/1')) return makeResponse(encA.cipher);
      if (u.endsWith('/blob/2')) return makeResponse(encB.cipher);
      return new Response(null, { status: 404 });
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const decoded: DecodedManifest = {
      version: 2,
      manifest: {
        version: 2,
        files: [
          {
            name: 'a.bin',
            size: fileA.byteLength,
            mime: 'application/octet-stream',
            blobId: 'blob-0001',
            chunkSize: 16777216,
            chunks: [{ iv: encA.iv, cipherSize: encA.cipherSize }],
          },
          {
            name: 'sub/b.bin',
            size: fileB.byteLength,
            mime: 'application/octet-stream',
            blobId: 'blob-0002',
            chunkSize: 16777216,
            chunks: [{ iv: encB.iv, cipherSize: encB.cipherSize }],
          },
        ],
        note: null,
      } satisfies ManifestV2,
    };

    const sink = makeMemorySink();
    const progress: ZipProgress[] = [];
    await streamShareAsZip('share-y', decoded, key, sink.writable, (p) => progress.push(p));

    const zip = sink.bytes();
    // ZIP local-file-header magic
    expect(zip[0]).toBe(0x50);
    expect(zip[1]).toBe(0x4b);
    expect(zip[2]).toBe(0x03);
    expect(zip[3]).toBe(0x04);

    // Filenames present somewhere in the archive (encoded as raw bytes)
    const decoder = new TextDecoder();
    const haystack = decoder.decode(zip);
    expect(haystack).toContain('a.bin');
    expect(haystack).toContain('sub/b.bin');

    // Two progress callbacks, in order
    expect(progress).toHaveLength(2);
    expect(progress[0]).toMatchObject({ fileIndex: 0, fileCount: 2, fileName: 'a.bin' });
    expect(progress[1]).toMatchObject({ fileIndex: 1, fileCount: 2, fileName: 'sub/b.bin' });

    // Each blob fetched exactly once, in order
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[0]![0])).toContain('/blob/1');
    expect(String(fetchMock.mock.calls[1]![0])).toContain('/blob/2');
  });

  it('aborts the writable stream when a blob fails authentication', async () => {
    const key = await generateKey();
    const file = crypto.getRandomValues(new Uint8Array(40));
    const enc = await encryptChunkBytes(key, file);

    globalThis.fetch = vi.fn(async () => makeResponse(enc.cipher)) as unknown as typeof fetch;

    // Wrong IV → auth tag failure
    const decoded: DecodedManifest = {
      version: 2,
      manifest: {
        version: 2,
        files: [
          {
            name: 'tampered.bin',
            size: file.byteLength,
            mime: 'application/octet-stream',
            blobId: 'blob-0001',
            chunkSize: 16777216,
            chunks: [{ iv: toBase64url(generateIV()), cipherSize: enc.cipherSize }],
          },
        ],
        note: null,
      } satisfies ManifestV2,
    };

    const sink = makeMemorySink();
    await expect(streamShareAsZip('share-y', decoded, key, sink.writable)).rejects.toBeDefined();
  });
});
