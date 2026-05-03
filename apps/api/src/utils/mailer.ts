/**
 * SMTP mailer wrapper around nodemailer.
 *
 * Configuration is read once at module-init time from environment variables.
 * If `SMTP_HOST` is unset, the mailer is disabled and {@link isMailerEnabled}
 * returns `false` — callers can decide whether to skip the send silently or
 * surface a "feature unavailable" error.
 *
 * Environment variables (all optional except SMTP_HOST):
 *   SMTP_HOST    — hostname of the relay (e.g. smtp.gmail.com)
 *   SMTP_PORT    — TCP port (default 587 for STARTTLS, 465 for implicit TLS)
 *   SMTP_SECURE  — "true" for implicit TLS (port 465). Default false.
 *   SMTP_USER    — auth username (skip auth entirely if both USER/PASS unset)
 *   SMTP_PASS    — auth password / app token
 *   SMTP_FROM    — From: header. Falls back to SMTP_USER if unset.
 *
 * The mailer never throws when disabled at init-time — that's a deployment
 * choice. It WILL throw on send failures so callers can log them; we
 * intentionally keep the error surface so a misconfigured relay is loud.
 */

import nodemailer, { type Transporter } from 'nodemailer';

interface MailerState {
  enabled: boolean;
  transporter: Transporter | null;
  from: string;
}

let _state: MailerState | null = null;

function readState(): MailerState {
  if (_state) return _state;
  const host = process.env.SMTP_HOST?.trim() ?? '';
  if (host === '') {
    _state = { enabled: false, transporter: null, from: '' };
    return _state;
  }
  const portRaw = process.env.SMTP_PORT?.trim();
  const port = portRaw ? Number(portRaw) : 587;
  if (!Number.isFinite(port) || port <= 0 || port > 65535) {
    throw new Error(`SMTP_PORT must be a valid TCP port, got "${portRaw ?? ''}"`);
  }
  const secureRaw = process.env.SMTP_SECURE?.trim().toLowerCase() ?? '';
  const secure = secureRaw === 'true' || secureRaw === '1' || secureRaw === 'yes';
  const user = process.env.SMTP_USER?.trim() ?? '';
  const pass = process.env.SMTP_PASS ?? '';
  const from = (process.env.SMTP_FROM?.trim() || user || `noreply@${host}`).trim();

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: user !== '' ? { user, pass } : undefined,
  });

  _state = { enabled: true, transporter, from };
  return _state;
}

export function isMailerEnabled(): boolean {
  return readState().enabled;
}

/**
 * Send a plain-text email. Throws when SMTP is disabled, the relay
 * rejects the message, or the network fails. Callers MUST treat this as
 * non-blocking for user-facing flows: log the error and continue, never
 * gate the response on it.
 */
export async function sendMail(to: string, subject: string, text: string): Promise<void> {
  const state = readState();
  if (!state.enabled || !state.transporter) {
    throw new Error('SMTP is not configured (set SMTP_HOST to enable)');
  }
  await state.transporter.sendMail({
    from: state.from,
    to,
    subject,
    text,
  });
}

/**
 * Reset the cached state. Test-only — production never re-reads env after
 * boot.
 */
export function resetMailerForTests(): void {
  _state = null;
}
