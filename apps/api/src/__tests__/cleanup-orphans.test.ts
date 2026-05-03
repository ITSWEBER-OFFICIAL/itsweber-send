/**
 * Cleanup-job orphan-reconciliation tests (Block D).
 *
 * Verifies the new pass that removes share-ids present in storage but
 * absent from the DB (e.g. a crash between deleteShare() and
 * storage.delete()). Pending in-progress upload slots must be exempt —
 * they have no shares row yet but still represent live state.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { initDb, closeDb, insertShare, insertUploadInProgress } from '../db/sqlite.js';
import { FilesystemStorage } from '../storage/filesystem.js';
import { runCleanupOnce } from '../jobs/cleanup.js';

let tmpDir: string;
let storageDir: string;
let storage: FilesystemStorage;

const silentLog = {
  info: () => {},
  warn: () => {},
  error: () => {},
};

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'itsweber-send-cleanup-'));
  storageDir = join(tmpDir, 'uploads');
  initDb(join(tmpDir, 'shares.db'));
  storage = new FilesystemStorage(storageDir);
});

afterEach(() => {
  closeDb();
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('listShareIds (filesystem)', () => {
  it('returns each top-level share directory exactly once', async () => {
    expect(await storage.listShareIds()).toEqual([]);
    await storage.put('share-a', 'meta.json', Buffer.from('{}'));
    await storage.put('share-b', 'meta.json', Buffer.from('{}'));
    await storage.appendStream('share-c', 'blob-0001', Readable.from([Buffer.from('x')]), 0);
    const ids = (await storage.listShareIds()).sort();
    expect(ids).toEqual(['share-a', 'share-b', 'share-c']);
  });

  it('returns [] when the base path does not exist', async () => {
    const fresh = new FilesystemStorage(join(tmpDir, 'does-not-exist'));
    expect(await fresh.listShareIds()).toEqual([]);
  });
});

describe('runCleanupOnce orphan reconciliation', () => {
  it('removes a share-directory that has no DB row', async () => {
    // Create a "real" share that the DB knows about.
    const future = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    insertShare({
      id: 'share-known',
      created_at: new Date().toISOString(),
      expires_at: future,
      download_limit: 0,
      downloads_used: 0,
      salt: null,
      iv_wrap: null,
      wrapped_key: null,
      user_id: null,
      total_size_bytes: 100,
    });
    await storage.put('share-known', 'meta.json', Buffer.from('{}'));

    // And an orphan: storage knows about it but DB does not.
    await storage.put('share-orphan', 'meta.json', Buffer.from('{}'));

    const out = await runCleanupOnce(storage, silentLog);
    expect(out.reconciledOrphans).toBe(1);

    const remaining = (await storage.listShareIds()).sort();
    expect(remaining).toEqual(['share-known']);
  });

  it('exempts pending-upload share-id slots from orphan deletion', async () => {
    // The resumable upload route reserves a share-id slot in
    // uploads_in_progress before the share row exists. Storage may have
    // partial blobs under that slot. The orphan pass must not delete it.
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    insertUploadInProgress({
      id: 'upload-pending-1',
      share_id: 'share-pending',
      user_id: null,
      created_at: new Date().toISOString(),
      expires_at: expiresAt,
      chunk_size: 16 * 1024 * 1024,
      declared_total_bytes: 100,
      expiry_hours: 24,
      download_limit: 0,
      password_protected: 0,
      salt: null,
      iv_wrap: null,
      wrapped_key: null,
      blobs_json: '[]',
      finalized: 0,
      notify_email: null,
    });
    await storage.appendStream(
      'share-pending',
      'blob-0001',
      Readable.from([Buffer.from('partial')]),
      0,
    );

    const out = await runCleanupOnce(storage, silentLog);
    expect(out.reconciledOrphans).toBe(0);
    expect(await storage.listShareIds()).toContain('share-pending');
  });

  it('reports zero orphans on an empty storage', async () => {
    const out = await runCleanupOnce(storage, silentLog);
    expect(out.reconciledOrphans).toBe(0);
    expect(out.expiredShares).toBe(0);
    expect(out.expiredUploads).toBe(0);
    expect(out.expiredSessions).toBe(true);
  });
});
