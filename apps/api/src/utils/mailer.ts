/**
 * SMTP mailer wrapper around nodemailer.
 *
 * Settings are read fresh on every send (no module-level cache) so the
 * admin UI can update them at runtime without a restart. Each `sendMail`
 * call performs a small SQLite read (a handful of rows) and constructs
 * a transporter on demand — acceptable overhead because notification
 * mails are rare events, never per-request.
 *
 * Resolution order: DB-stored `system_settings.smtp_*` first, then
 * matching `SMTP_*` environment variables. Empty / unset means the
 * mailer is disabled silently and {@link isMailerEnabled} returns false.
 *
 * The mailer never throws on disabled-state — that's a deployment
 * choice. It WILL throw on send failures so callers can log them.
 */

import nodemailer, { type Transporter } from 'nodemailer';
import { getSetting } from '../db/sqlite.js';

export interface MailerConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  from: string;
}

/**
 * Read effective SMTP config. DB takes precedence over env so admins can
 * override at runtime via the admin UI. Returns `null` when no host is
 * configured anywhere.
 */
export function getMailerConfig(): MailerConfig | null {
  const host = (getSetting('smtp_host') ?? process.env.SMTP_HOST ?? '').trim();
  if (host === '') return null;

  const portRaw = (getSetting('smtp_port') ?? process.env.SMTP_PORT ?? '').trim();
  const port = portRaw ? Number(portRaw) : 587;
  if (!Number.isFinite(port) || port <= 0 || port > 65535) {
    throw new Error(`smtp_port must be a valid TCP port, got "${portRaw}"`);
  }

  const secureRaw = (getSetting('smtp_secure') ?? process.env.SMTP_SECURE ?? '')
    .trim()
    .toLowerCase();
  const secure = secureRaw === 'true' || secureRaw === '1' || secureRaw === 'yes';

  const user = (getSetting('smtp_user') ?? process.env.SMTP_USER ?? '').trim();
  const pass = getSetting('smtp_pass') ?? process.env.SMTP_PASS ?? '';
  const from =
    (getSetting('smtp_from') ?? process.env.SMTP_FROM ?? '').trim() || user || `noreply@${host}`;

  return { host, port, secure, user, pass, from };
}

export function isMailerEnabled(): boolean {
  try {
    return getMailerConfig() !== null;
  } catch {
    // A misconfigured port reads as "not enabled" rather than crashing
    // the caller; the admin UI surfaces the underlying error via the
    // test-mail endpoint.
    return false;
  }
}

function buildTransporter(cfg: MailerConfig): Transporter {
  return nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth: cfg.user !== '' ? { user: cfg.user, pass: cfg.pass } : undefined,
  });
}

/**
 * Send a plain-text email. Throws when SMTP is disabled or the relay /
 * network rejects the message. Callers MUST treat this as
 * non-blocking for user-facing flows: log the error and continue, never
 * gate the response on it.
 */
export async function sendMail(to: string, subject: string, text: string): Promise<void> {
  const cfg = getMailerConfig();
  if (!cfg) {
    throw new Error('SMTP is not configured (set SMTP_HOST or smtp_host setting to enable)');
  }
  const transporter = buildTransporter(cfg);
  await transporter.sendMail({ from: cfg.from, to, subject, text });
}

/**
 * Verify that the configured relay accepts our credentials. Used by the
 * admin "Send test email" button — surfaces the underlying connection /
 * auth error verbatim so an admin can see what is wrong without having
 * to grep server logs.
 */
export async function verifyAndSendTest(to: string): Promise<void> {
  const cfg = getMailerConfig();
  if (!cfg) {
    throw new Error('SMTP is not configured');
  }
  const transporter = buildTransporter(cfg);
  await transporter.verify();
  await transporter.sendMail({
    from: cfg.from,
    to,
    subject: 'ITSWEBER Send — SMTP test',
    text:
      'This is a test email from your ITSWEBER Send instance.\n\n' +
      'If you received this, your SMTP relay accepts the configured credentials.\n',
  });
}

/** Test-only no-op kept for compatibility with earlier tests. */
export function resetMailerForTests(): void {
  /* no module state to reset since the cache was removed */
}
