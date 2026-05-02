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
  user_id: string | null;
  total_size_bytes: number;
}

export interface UserRecord {
  id: string;
  email: string;
  password_hash: string;
  created_at: string;
  last_login_at: string | null;
  role: 'user' | 'admin';
  quota_bytes: number;
}

export interface SessionRecord {
  id: string;
  user_id: string;
  created_at: string;
  expires_at: string;
}

let _db: Database.Database | null = null;

export function initDb(dbPath: string): void {
  mkdirSync(dirname(dbPath), { recursive: true });
  _db = new Database(dbPath);

  _db.exec(`
    CREATE TABLE IF NOT EXISTS shares (
      id              TEXT    PRIMARY KEY,
      created_at      TEXT    NOT NULL,
      expires_at      TEXT    NOT NULL,
      download_limit  INTEGER NOT NULL DEFAULT 0,
      downloads_used  INTEGER NOT NULL DEFAULT 0,
      salt            TEXT,
      iv_wrap         TEXT,
      wrapped_key     TEXT
    );

    CREATE TABLE IF NOT EXISTS users (
      id              TEXT    PRIMARY KEY,
      email           TEXT    UNIQUE NOT NULL,
      password_hash   TEXT    NOT NULL,
      created_at      TEXT    NOT NULL,
      last_login_at   TEXT,
      role            TEXT    NOT NULL DEFAULT 'user',
      quota_bytes     INTEGER NOT NULL DEFAULT 5368709120
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id          TEXT PRIMARY KEY,
      user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at  TEXT NOT NULL,
      expires_at  TEXT NOT NULL
    );
  `);

  // Idempotent column migrations for existing shares tables
  const sharesCols = (_db.prepare("PRAGMA table_info(shares)").all() as { name: string }[]).map(
    (c) => c.name,
  );
  if (!sharesCols.includes('user_id')) {
    _db.exec('ALTER TABLE shares ADD COLUMN user_id TEXT');
  }
  if (!sharesCols.includes('total_size_bytes')) {
    _db.exec('ALTER TABLE shares ADD COLUMN total_size_bytes INTEGER NOT NULL DEFAULT 0');
  }
}

function db(): Database.Database {
  if (!_db) throw new Error('Database not initialized — call initDb() first');
  return _db;
}

// ---------------------------------------------------------------------------
// Shares
// ---------------------------------------------------------------------------

export function insertShare(share: Omit<ShareRecord, 'total_size_bytes'> & { total_size_bytes?: number }): void {
  db()
    .prepare(
      `INSERT INTO shares
         (id, created_at, expires_at, download_limit, downloads_used, salt, iv_wrap, wrapped_key, user_id, total_size_bytes)
       VALUES
         (@id, @created_at, @expires_at, @download_limit, @downloads_used, @salt, @iv_wrap, @wrapped_key, @user_id, @total_size_bytes)`,
    )
    .run({ ...share, user_id: share.user_id ?? null, total_size_bytes: share.total_size_bytes ?? 0 });
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

export function getSharesByUser(userId: string): ShareRecord[] {
  return db()
    .prepare('SELECT * FROM shares WHERE user_id = ? ORDER BY created_at DESC')
    .all(userId) as ShareRecord[];
}

export function getUserQuotaUsed(userId: string): number {
  const row = db()
    .prepare(
      `SELECT COALESCE(SUM(total_size_bytes), 0) AS used
       FROM shares WHERE user_id = ? AND expires_at > datetime('now')`,
    )
    .get(userId) as { used: number };
  return row.used;
}

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

export function insertUser(user: Omit<UserRecord, 'last_login_at'> & { last_login_at?: string | null }): void {
  db()
    .prepare(
      `INSERT INTO users (id, email, password_hash, created_at, last_login_at, role, quota_bytes)
       VALUES (@id, @email, @password_hash, @created_at, @last_login_at, @role, @quota_bytes)`,
    )
    .run({ ...user, last_login_at: user.last_login_at ?? null });
}

export function getUserByEmail(email: string): UserRecord | undefined {
  return db().prepare('SELECT * FROM users WHERE email = ?').get(email) as UserRecord | undefined;
}

export function getUserById(id: string): UserRecord | undefined {
  return db().prepare('SELECT * FROM users WHERE id = ?').get(id) as UserRecord | undefined;
}

export function updateLastLogin(userId: string, at: string): void {
  db().prepare('UPDATE users SET last_login_at = ? WHERE id = ?').run(at, userId);
}

export function countUsers(): number {
  const row = db().prepare('SELECT COUNT(*) AS cnt FROM users').get() as { cnt: number };
  return row.cnt;
}

export function listUsers(limit = 100, offset = 0): UserRecord[] {
  return db()
    .prepare('SELECT * FROM users ORDER BY created_at DESC LIMIT ? OFFSET ?')
    .all(limit, offset) as UserRecord[];
}

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

export function insertSession(session: SessionRecord): void {
  db()
    .prepare(
      `INSERT INTO sessions (id, user_id, created_at, expires_at)
       VALUES (@id, @user_id, @created_at, @expires_at)`,
    )
    .run(session);
}

export function getSession(id: string): SessionRecord | undefined {
  return db()
    .prepare("SELECT * FROM sessions WHERE id = ? AND expires_at > datetime('now')")
    .get(id) as SessionRecord | undefined;
}

export function deleteSession(id: string): void {
  db().prepare('DELETE FROM sessions WHERE id = ?').run(id);
}

export function deleteExpiredSessions(): void {
  db().prepare("DELETE FROM sessions WHERE expires_at <= datetime('now')").run();
}

// ---------------------------------------------------------------------------
// Admin stats
// ---------------------------------------------------------------------------

export function getStats(): {
  totalUsers: number;
  totalShares: number;
  activeShares: number;
  totalStorageBytes: number;
} {
  const totalUsers = (db().prepare('SELECT COUNT(*) AS cnt FROM users').get() as { cnt: number }).cnt;
  const totalShares = (db().prepare('SELECT COUNT(*) AS cnt FROM shares').get() as { cnt: number }).cnt;
  const activeShares = (
    db()
      .prepare("SELECT COUNT(*) AS cnt FROM shares WHERE expires_at > datetime('now')")
      .get() as { cnt: number }
  ).cnt;
  const totalStorageBytes = (
    db()
      .prepare(
        "SELECT COALESCE(SUM(total_size_bytes), 0) AS total FROM shares WHERE expires_at > datetime('now')",
      )
      .get() as { total: number }
  ).total;
  return { totalUsers, totalShares, activeShares, totalStorageBytes };
}
