import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { FilesystemStorage } from '../storage/filesystem.js';

let tmpDir: string;
let storage: FilesystemStorage;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'itsweber-send-stream-'));
  storage = new FilesystemStorage(tmpDir);
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

async function readAll(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as ArrayBufferLike));
  }
  return Buffer.concat(chunks);
}

describe('FilesystemStorage stream extensions', () => {
  it('appendStream concatenates multiple chunks into one blob', async () => {
    const a = Buffer.from('first-');
    const b = Buffer.from('second-');
    const c = Buffer.from('third');
    const r1 = await storage.appendStream('share-1', 'blob-0001', Readable.from([a]));
    const r2 = await storage.appendStream('share-1', 'blob-0001', Readable.from([b]));
    const r3 = await storage.appendStream('share-1', 'blob-0001', Readable.from([c]));
    expect(r1.bytesWritten).toBe(a.byteLength);
    expect(r2.bytesWritten).toBe(b.byteLength);
    expect(r3.bytesWritten).toBe(c.byteLength);

    const stream = await storage.getStream('share-1', 'blob-0001');
    const out = await readAll(stream);
    expect(out.toString()).toBe('first-second-third');
  });

  it('size reports the cumulative bytes written', async () => {
    expect(await storage.size('share-2', 'blob-0001')).toBeNull();
    await storage.appendStream('share-2', 'blob-0001', Readable.from([Buffer.alloc(1024)]));
    expect(await storage.size('share-2', 'blob-0001')).toBe(1024);
    await storage.appendStream('share-2', 'blob-0001', Readable.from([Buffer.alloc(512)]));
    expect(await storage.size('share-2', 'blob-0001')).toBe(1536);
  });

  it('getStream honours an inclusive byte range', async () => {
    await storage.appendStream(
      'share-3',
      'blob-0001',
      Readable.from([Buffer.from('0123456789ABCDEF')]),
    );
    const stream = await storage.getStream('share-3', 'blob-0001', { start: 4, end: 9 });
    const out = await readAll(stream);
    expect(out.toString()).toBe('456789');
  });

  it('appendStream survives a multi-chunk synthetic source', async () => {
    const parts = Array.from({ length: 8 }, () => Buffer.from('x'.repeat(1024)));
    await storage.appendStream('share-4', 'blob-0001', Readable.from(parts));
    expect(await storage.size('share-4', 'blob-0001')).toBe(8 * 1024);
  });
});
