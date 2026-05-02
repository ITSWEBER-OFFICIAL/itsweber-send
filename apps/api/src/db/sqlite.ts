import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export interface ShareRecord {
  id: string;
  created_at: string;
  expires_at: string;
  download_limit: number;
  downloads_used: number;
  salt: string | null;
  iv_wrap: string | null;
  wrapped_key: string | null;
}

let _db: Database.Database | null = null;

export function initDb(dbPath: string): void {
  mkdirSync(dirname(dbPath), { recursive: true });
  _db = new Database(dbPath);
  _db.exec(`
    CREATE TABLE IF NOT EXISTS shares (
      id            TEXT    PRIMARY KEY,
      created_at    TEXT    NOT NULL,
      expires_at    TEXT    NOT NULL,
      download_limit  INTEGER NOT NULL DEFAULT 0,
      downloads_used  INTEGER NOT NULL DEFAULT 0,
      salt          TEXT,
      iv_wrap       TEXT,
      wrapped_key   TEXT
    )
  `);
}

function db(): Database.Database {
  if (!_db) throw new Error('Database not initialized — call initDb() first');
  return _db;
}

export function insertShare(share: ShareRecord): void {
  db()
    .prepare(
      `INSERT INTO shares
         (id, created_at, expires_at, download_limit, downloads_used, salt, iv_wrap, wrapped_key)
       VALUES
         (@id, @created_at, @expires_at, @download_limit, @downloads_used, @salt, @iv_wrap, @wrapped_key)`,
    )
    .run(share);
}

export function getShare(id: string): ShareRecord | undefined {
  return db().prepare('SELECT * FROM shares WHERE id = ?').get(id) as ShareRecord | undefined;
}

export function incrementDownloads(id: string): void {
  db().prepare('UPDATE shares SET downloads_used = downloads_used + 1 WHERE id = ?').run(id);
}

export function deleteShare(id: string): void {
  db().prepare('DELETE FROM shares WHERE id = ?').run(id);
}

export function getExpiredShareIds(cutoff: Date): string[] {
  const rows = db()
    .prepare('SELECT id FROM shares WHERE expires_at < ?')
    .all(cutoff.toISOString()) as { id: string }[];
  return rows.map((r) => r.id);
}
