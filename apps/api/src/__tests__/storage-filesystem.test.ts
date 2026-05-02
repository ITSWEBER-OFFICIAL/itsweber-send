import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FilesystemStorage } from '../storage/filesystem.js';

let tmpDir: string;
let storage: FilesystemStorage;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'itsweber-send-test-'));
  storage = new FilesystemStorage(tmpDir);
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('FilesystemStorage', () => {
  it('put and get roundtrip', async () => {
    const data = Buffer.from('hello world');
    await storage.put('share-1', 'manifest', data);
    const result = await storage.get('share-1', 'manifest');
    expect(result).toEqual(data);
  });

  it('put creates nested directories', async () => {
    await storage.put('new-share', 'blob-0001', Buffer.from('ciphertext'));
    const result = await storage.get('new-share', 'blob-0001');
    expect(result.toString()).toBe('ciphertext');
  });

  it('get throws for missing file', async () => {
    await expect(storage.get('nonexistent', 'manifest')).rejects.toThrow();
  });

  it('exists returns true after put', async () => {
    expect(await storage.exists('share-abc')).toBe(false);
    await storage.put('share-abc', 'manifest', Buffer.from('x'));
    expect(await storage.exists('share-abc')).toBe(true);
  });

  it('exists returns false for unknown share', async () => {
    expect(await storage.exists('no-such-share')).toBe(false);
  });

  it('delete removes the share directory', async () => {
    await storage.put('to-delete', 'manifest', Buffer.from('data'));
    expect(await storage.exists('to-delete')).toBe(true);
    await storage.delete('to-delete');
    expect(await storage.exists('to-delete')).toBe(false);
  });

  it('delete on non-existent share is a no-op', async () => {
    await expect(storage.delete('phantom')).resolves.not.toThrow();
  });

  it('multiple blobs coexist in one share', async () => {
    await storage.put('multi', 'blob-0001', Buffer.from('file1'));
    await storage.put('multi', 'blob-0002', Buffer.from('file2'));
    expect((await storage.get('multi', 'blob-0001')).toString()).toBe('file1');
    expect((await storage.get('multi', 'blob-0002')).toString()).toBe('file2');
  });

  it('expireBefore returns shares with expiresAt before cutoff', async () => {
    const past = new Date(Date.now() - 60_000).toISOString();
    const future = new Date(Date.now() + 60_000).toISOString();

    await storage.put('expired', 'meta.json', Buffer.from(JSON.stringify({ expiresAt: past })));
    await storage.put('fresh', 'meta.json', Buffer.from(JSON.stringify({ expiresAt: future })));

    const expired = await storage.expireBefore(new Date());
    expect(expired).toContain('expired');
    expect(expired).not.toContain('fresh');
  });

  it('expireBefore ignores directories with missing or malformed meta.json', async () => {
    await storage.put('no-meta', 'manifest', Buffer.from('data'));
    await storage.put('bad-meta', 'meta.json', Buffer.from('not-json'));
    const result = await storage.expireBefore(new Date());
    expect(result).not.toContain('no-meta');
    expect(result).not.toContain('bad-meta');
  });
});
