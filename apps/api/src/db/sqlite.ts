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
  wordcode: string | null;
  file_count: number;
  /** Manifest format version. 1 = legacy single-blob AES-GCM, 2 = chunked AES-GCM (v1.1+). */
  manifest_version: number;
}

export interface UserRecord {
  id: string;
  email: string;
  password_hash: string;
  created_at: string;
  last_login_at: string | null;
  role: 'user' | 'admin';
  quota_bytes: number;
  display_name: string | null;
  totp_secret: string | null;
  totp_enabled: number;
  email_on_download: number;
  email_on_expiry: number;
}

export interface SessionRecord {
  id: string;
  user_id: string;
  created_at: string;
  expires_at: string;
}

export interface ApiTokenRecord {
  id: string;
  user_id: string;
  name: string;
  token_hash: string;
  created_at: string;
  last_used_at: string | null;
  expires_at: string | null;
}

export interface AuditLogRecord {
  id: number;
  user_id: string | null;
  action: string;
  resource: string | null;
  ip: string | null;
  created_at: string;
}

/**
 * Pending resumable upload. The upload reserves a share-id slot but the
 * share row only exists once {@link finalizeUpload} commits. `blobs_json`
 * is the JSON-serialised plan: `[{ blobId, expectedCipherSize, expectedChunks,
 * receivedBytes, receivedChunks }, …]`.
 */
export interface UploadInProgressRecord {
  id: string; // upload-id (24-hex)
  share_id: string; // share-id reserved at create-time (24-hex)
  user_id: string | null;
  created_at: string;
  expires_at: string; // resume window
  chunk_size: number; // plaintext bytes per chunk; informational
  declared_total_bytes: number;
  expiry_hours: number;
  download_limit: number;
  password_protected: number;
  salt: string | null;
  iv_wrap: string | null;
  wrapped_key: string | null;
  blobs_json: string;
  finalized: number; // 0 = pending, 1 = committed
}

/**
 * One usable recovery code per row. Codes are hashed with Argon2id and
 * marked `used_at` once consumed. See {@link consumeMfaRecoveryCode}.
 */
export interface MfaRecoveryCodeRecord {
  id: string;
  user_id: string;
  code_hash: string;
  created_at: string;
  used_at: string | null;
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

    CREATE TABLE IF NOT EXISTS api_tokens (
      id            TEXT PRIMARY KEY,
      user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name          TEXT NOT NULL,
      token_hash    TEXT NOT NULL UNIQUE,
      created_at    TEXT NOT NULL,
      last_used_at  TEXT,
      expires_at    TEXT
    );

    CREATE TABLE IF NOT EXISTS audit_log (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id     TEXT,
      action      TEXT NOT NULL,
      resource    TEXT,
      ip          TEXT,
      created_at  TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS system_settings (
      key         TEXT PRIMARY KEY,
      value       TEXT NOT NULL,
      updated_at  TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS uploads_in_progress (
      id                    TEXT PRIMARY KEY,
      share_id              TEXT NOT NULL,
      user_id               TEXT REFERENCES users(id) ON DELETE CASCADE,
      created_at            TEXT NOT NULL,
      expires_at            TEXT NOT NULL,
      chunk_size            INTEGER NOT NULL,
      declared_total_bytes  INTEGER NOT NULL,
      expiry_hours          INTEGER NOT NULL,
      download_limit        INTEGER NOT NULL,
      password_protected    INTEGER NOT NULL DEFAULT 0,
      salt                  TEXT,
      iv_wrap               TEXT,
      wrapped_key           TEXT,
      blobs_json            TEXT NOT NULL,
      finalized             INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_uploads_expires_at ON uploads_in_progress(expires_at);
    CREATE INDEX IF NOT EXISTS idx_uploads_user_id ON uploads_in_progress(user_id);

    CREATE TABLE IF NOT EXISTS mfa_recovery_codes (
      id          TEXT PRIMARY KEY,
      user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      code_hash   TEXT NOT NULL,
      created_at  TEXT NOT NULL,
      used_at     TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_mfa_recovery_user ON mfa_recovery_codes(user_id);
  `);

  _db.pragma('foreign_keys = ON');

  // Idempotent column migrations
  const sharesCols = (_db.prepare('PRAGMA table_info(shares)').all() as { name: string }[]).map(
    (c) => c.name,
  );
  if (!sharesCols.includes('user_id')) {
    _db.exec('ALTER TABLE shares ADD COLUMN user_id TEXT');
  }
  if (!sharesCols.includes('total_size_bytes')) {
    _db.exec('ALTER TABLE shares ADD COLUMN total_size_bytes INTEGER NOT NULL DEFAULT 0');
  }
  if (!sharesCols.includes('wordcode')) {
    _db.exec('ALTER TABLE shares ADD COLUMN wordcode TEXT');
    _db.exec(
      'CREATE UNIQUE INDEX IF NOT EXISTS idx_shares_wordcode ON shares(wordcode) WHERE wordcode IS NOT NULL',
    );
  }
  if (!sharesCols.includes('file_count')) {
    _db.exec('ALTER TABLE shares ADD COLUMN file_count INTEGER NOT NULL DEFAULT 1');
  }
  if (!sharesCols.includes('manifest_version')) {
    // Existing shares are v1; new shares from the resumable path declare 2.
    _db.exec('ALTER TABLE shares ADD COLUMN manifest_version INTEGER NOT NULL DEFAULT 1');
  }

  const usersCols = (_db.prepare('PRAGMA table_info(users)').all() as { name: string }[]).map(
    (c) => c.name,
  );
  if (!usersCols.includes('display_name')) {
    _db.exec('ALTER TABLE users ADD COLUMN display_name TEXT');
  }
  if (!usersCols.includes('totp_secret')) {
    _db.exec('ALTER TABLE users ADD COLUMN totp_secret TEXT');
  }
  if (!usersCols.includes('totp_enabled')) {
    _db.exec('ALTER TABLE users ADD COLUMN totp_enabled INTEGER NOT NULL DEFAULT 0');
  }
  if (!usersCols.includes('email_on_download')) {
    _db.exec('ALTER TABLE users ADD COLUMN email_on_download INTEGER NOT NULL DEFAULT 1');
  }
  if (!usersCols.includes('email_on_expiry')) {
    _db.exec('ALTER TABLE users ADD COLUMN email_on_expiry INTEGER NOT NULL DEFAULT 1');
  }
}

function db(): Database.Database {
  if (!_db) throw new Error('Database not initialized — call initDb() first');
  return _db;
}

// ---------------------------------------------------------------------------
// Shares
// ---------------------------------------------------------------------------

export function insertShare(
  share: Omit<ShareRecord, 'total_size_bytes' | 'wordcode' | 'file_count' | 'manifest_version'> & {
    total_size_bytes?: number;
    wordcode?: string | null;
    file_count?: number;
    manifest_version?: number;
  },
): void {
  db()
    .prepare(
      `INSERT INTO shares
         (id, created_at, expires_at, download_limit, downloads_used, salt, iv_wrap, wrapped_key, user_id, total_size_bytes, wordcode, file_count, manifest_version)
       VALUES
         (@id, @created_at, @expires_at, @download_limit, @downloads_used, @salt, @iv_wrap, @wrapped_key, @user_id, @total_size_bytes, @wordcode, @file_count, @manifest_version)`,
    )
    .run({
      ...share,
      user_id: share.user_id ?? null,
      total_size_bytes: share.total_size_bytes ?? 0,
      wordcode: share.wordcode ?? null,
      file_count: share.file_count ?? 1,
      manifest_version: share.manifest_version ?? 1,
    });
}

export function getShare(id: string): ShareRecord | undefined {
  return db().prepare('SELECT * FROM shares WHERE id = ?').get(id) as ShareRecord | undefined;
}

export function getShareByWordcode(wordcode: string): ShareRecord | undefined {
  return db().prepare('SELECT * FROM shares WHERE wordcode = ?').get(wordcode) as
    | ShareRecord
    | undefined;
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

export interface AdminShareRow {
  id: string;
  created_at: string;
  expires_at: string;
  download_limit: number;
  downloads_used: number;
  total_size_bytes: number;
  user_id: string | null;
  user_email: string | null;
  wordcode: string | null;
  password_protected: number;
}

export function listAllShares(limit = 100, offset = 0): AdminShareRow[] {
  return db()
    .prepare(
      `SELECT s.id, s.created_at, s.expires_at, s.download_limit, s.downloads_used,
              s.total_size_bytes, s.user_id, u.email AS user_email, s.wordcode,
              CASE WHEN s.salt IS NOT NULL THEN 1 ELSE 0 END AS password_protected
       FROM shares s
       LEFT JOIN users u ON s.user_id = u.id
       ORDER BY s.created_at DESC
       LIMIT ? OFFSET ?`,
    )
    .all(limit, offset) as AdminShareRow[];
}

export function countShares(): number {
  return (db().prepare('SELECT COUNT(*) AS cnt FROM shares').get() as { cnt: number }).cnt;
}

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

export function insertUser(
  user: Omit<
    UserRecord,
    | 'last_login_at'
    | 'display_name'
    | 'totp_secret'
    | 'totp_enabled'
    | 'email_on_download'
    | 'email_on_expiry'
  > & { last_login_at?: string | null },
): void {
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

export function updateUserProfile(
  userId: string,
  fields: { email?: string; display_name?: string | null },
): void {
  if (fields.email !== undefined) {
    db().prepare('UPDATE users SET email = ? WHERE id = ?').run(fields.email, userId);
  }
  if (fields.display_name !== undefined) {
    db().prepare('UPDATE users SET display_name = ? WHERE id = ?').run(fields.display_name, userId);
  }
}

export function updateUserPassword(userId: string, passwordHash: string): void {
  db().prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(passwordHash, userId);
}

export function updateUserNotifications(
  userId: string,
  emailOnDownload: boolean,
  emailOnExpiry: boolean,
): void {
  db()
    .prepare('UPDATE users SET email_on_download = ?, email_on_expiry = ? WHERE id = ?')
    .run(emailOnDownload ? 1 : 0, emailOnExpiry ? 1 : 0, userId);
}

export function setUserTotp(userId: string, secret: string | null, enabled: boolean): void {
  db()
    .prepare('UPDATE users SET totp_secret = ?, totp_enabled = ? WHERE id = ?')
    .run(secret, enabled ? 1 : 0, userId);
}

export function updateUserQuota(userId: string, quotaBytes: number): void {
  db().prepare('UPDATE users SET quota_bytes = ? WHERE id = ?').run(quotaBytes, userId);
}

export function updateUserRole(userId: string, role: 'user' | 'admin'): void {
  db().prepare('UPDATE users SET role = ? WHERE id = ?').run(role, userId);
}

export function deleteUser(userId: string): void {
  db().prepare('DELETE FROM users WHERE id = ?').run(userId);
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

export function deleteUserSessions(userId: string): void {
  db().prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
}

// ---------------------------------------------------------------------------
// API Tokens
// ---------------------------------------------------------------------------

export function insertApiToken(token: ApiTokenRecord): void {
  db()
    .prepare(
      `INSERT INTO api_tokens (id, user_id, name, token_hash, created_at, last_used_at, expires_at)
       VALUES (@id, @user_id, @name, @token_hash, @created_at, @last_used_at, @expires_at)`,
    )
    .run({
      ...token,
      last_used_at: token.last_used_at ?? null,
      expires_at: token.expires_at ?? null,
    });
}

export function getApiTokensByUser(userId: string): ApiTokenRecord[] {
  return db()
    .prepare('SELECT * FROM api_tokens WHERE user_id = ? ORDER BY created_at DESC')
    .all(userId) as ApiTokenRecord[];
}

export function getApiTokenByHash(hash: string): ApiTokenRecord | undefined {
  return db()
    .prepare(
      "SELECT * FROM api_tokens WHERE token_hash = ? AND (expires_at IS NULL OR expires_at > datetime('now'))",
    )
    .get(hash) as ApiTokenRecord | undefined;
}

export function deleteApiToken(id: string, userId: string): void {
  db().prepare('DELETE FROM api_tokens WHERE id = ? AND user_id = ?').run(id, userId);
}

export function touchApiToken(id: string, at: string): void {
  db().prepare('UPDATE api_tokens SET last_used_at = ? WHERE id = ?').run(at, id);
}

// ---------------------------------------------------------------------------
// Audit Log
// ---------------------------------------------------------------------------

export function insertAuditLog(entry: Omit<AuditLogRecord, 'id'>): void {
  db()
    .prepare(
      `INSERT INTO audit_log (user_id, action, resource, ip, created_at)
       VALUES (@user_id, @action, @resource, @ip, @created_at)`,
    )
    .run({
      ...entry,
      user_id: entry.user_id ?? null,
      resource: entry.resource ?? null,
      ip: entry.ip ?? null,
    });
}

export function getAuditLogByUser(userId: string, limit = 100, offset = 0): AuditLogRecord[] {
  return db()
    .prepare('SELECT * FROM audit_log WHERE user_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?')
    .all(userId, limit, offset) as AuditLogRecord[];
}

export function getAuditLogAll(limit = 100, offset = 0): AuditLogRecord[] {
  return db()
    .prepare('SELECT * FROM audit_log ORDER BY created_at DESC LIMIT ? OFFSET ?')
    .all(limit, offset) as AuditLogRecord[];
}

export function countAuditLogByUser(userId: string): number {
  return (
    db().prepare('SELECT COUNT(*) AS cnt FROM audit_log WHERE user_id = ?').get(userId) as {
      cnt: number;
    }
  ).cnt;
}

export function countAuditLogAll(): number {
  return (db().prepare('SELECT COUNT(*) AS cnt FROM audit_log').get() as { cnt: number }).cnt;
}

// ---------------------------------------------------------------------------
// System Settings
// ---------------------------------------------------------------------------

export function getSetting(key: string): string | undefined {
  const row = db().prepare('SELECT value FROM system_settings WHERE key = ?').get(key) as
    | { value: string }
    | undefined;
  return row?.value;
}

export function setSetting(key: string, value: string): void {
  db()
    .prepare(
      `INSERT INTO system_settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    )
    .run(key, value);
}

export function getAllSettings(): Record<string, string> {
  const rows = db().prepare('SELECT key, value FROM system_settings').all() as {
    key: string;
    value: string;
  }[];
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

// ---------------------------------------------------------------------------
// Resumable uploads (uploads_in_progress)
// ---------------------------------------------------------------------------

export function insertUploadInProgress(record: UploadInProgressRecord): void {
  db()
    .prepare(
      `INSERT INTO uploads_in_progress
         (id, share_id, user_id, created_at, expires_at, chunk_size,
          declared_total_bytes, expiry_hours, download_limit,
          password_protected, salt, iv_wrap, wrapped_key, blobs_json, finalized)
       VALUES
         (@id, @share_id, @user_id, @created_at, @expires_at, @chunk_size,
          @declared_total_bytes, @expiry_hours, @download_limit,
          @password_protected, @salt, @iv_wrap, @wrapped_key, @blobs_json, @finalized)`,
    )
    .run(record);
}

export function getUploadInProgress(id: string): UploadInProgressRecord | undefined {
  return db().prepare('SELECT * FROM uploads_in_progress WHERE id = ?').get(id) as
    | UploadInProgressRecord
    | undefined;
}

export function updateUploadBlobsJson(id: string, blobsJson: string): void {
  db().prepare('UPDATE uploads_in_progress SET blobs_json = ? WHERE id = ?').run(blobsJson, id);
}

export function markUploadFinalized(id: string): void {
  db().prepare('UPDATE uploads_in_progress SET finalized = 1 WHERE id = ?').run(id);
}

export function deleteUploadInProgress(id: string): void {
  db().prepare('DELETE FROM uploads_in_progress WHERE id = ?').run(id);
}

export function getExpiredUploadIds(cutoff: Date): UploadInProgressRecord[] {
  return db()
    .prepare('SELECT * FROM uploads_in_progress WHERE finalized = 0 AND expires_at < ?')
    .all(cutoff.toISOString()) as UploadInProgressRecord[];
}

export function getUserUploadInProgressBytes(userId: string): number {
  const row = db()
    .prepare(
      `SELECT COALESCE(SUM(declared_total_bytes), 0) AS used
       FROM uploads_in_progress
       WHERE user_id = ? AND finalized = 0 AND expires_at > datetime('now')`,
    )
    .get(userId) as { used: number };
  return row.used;
}

// ---------------------------------------------------------------------------
// 2FA recovery codes (mfa_recovery_codes)
// ---------------------------------------------------------------------------

export function insertMfaRecoveryCodes(records: MfaRecoveryCodeRecord[]): void {
  const insert = db().prepare(
    `INSERT INTO mfa_recovery_codes (id, user_id, code_hash, created_at, used_at)
     VALUES (@id, @user_id, @code_hash, @created_at, @used_at)`,
  );
  const tx = db().transaction((rows: MfaRecoveryCodeRecord[]) => {
    for (const r of rows) insert.run(r);
  });
  tx(records);
}

export function getActiveMfaRecoveryCodes(userId: string): MfaRecoveryCodeRecord[] {
  return db()
    .prepare('SELECT * FROM mfa_recovery_codes WHERE user_id = ? AND used_at IS NULL')
    .all(userId) as MfaRecoveryCodeRecord[];
}

export function countActiveMfaRecoveryCodes(userId: string): number {
  const row = db()
    .prepare('SELECT COUNT(*) AS cnt FROM mfa_recovery_codes WHERE user_id = ? AND used_at IS NULL')
    .get(userId) as { cnt: number };
  return row.cnt;
}

export function markMfaRecoveryCodeUsed(id: string, at: string): void {
  db()
    .prepare('UPDATE mfa_recovery_codes SET used_at = ? WHERE id = ? AND used_at IS NULL')
    .run(at, id);
}

export function deleteMfaRecoveryCodes(userId: string): void {
  db().prepare('DELETE FROM mfa_recovery_codes WHERE user_id = ?').run(userId);
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
  const totalUsers = (db().prepare('SELECT COUNT(*) AS cnt FROM users').get() as { cnt: number })
    .cnt;
  const totalShares = (db().prepare('SELECT COUNT(*) AS cnt FROM shares').get() as { cnt: number })
    .cnt;
  const activeShares = (
    db().prepare("SELECT COUNT(*) AS cnt FROM shares WHERE expires_at > datetime('now')").get() as {
      cnt: number;
    }
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
