import { createHmac } from 'node:crypto';
import type { FastifyBaseLogger } from 'fastify';
import { config } from '../config.js';

export type WebhookEvent =
  | {
      type: 'upload.created';
      shareId: string;
      fileCount: number;
      totalSizeBytes: number;
      userId: string | null;
      expiresAt: string;
    }
  | {
      type: 'download.completed';
      shareId: string;
      blobIndex: number;
      remainingDownloads: number | null;
    };

function sign(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('hex');
}

export async function emitWebhook(event: WebhookEvent, log: FastifyBaseLogger): Promise<void> {
  const { url, secret } = config.webhook;
  if (!url) return;

  const payload = JSON.stringify({ ...event, timestamp: new Date().toISOString() });
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'User-Agent': 'itsweber-send/1.0',
  };
  if (secret) {
    headers['X-Webhook-Signature'] = `sha256=${sign(payload, secret)}`;
  }

  // Fire-and-forget with a single retry on network error.
  const attempt = async () =>
    fetch(url, { method: 'POST', headers, body: payload, signal: AbortSignal.timeout(10_000) });

  try {
    const res = await attempt();
    if (!res.ok) {
      log.warn({ event: event.type, status: res.status }, 'webhook delivery failed, retrying');
      await new Promise((r) => setTimeout(r, 2000));
      const retry = await attempt();
      if (!retry.ok) {
        log.error(
          { event: event.type, status: retry.status },
          'webhook delivery failed after retry',
        );
      }
    }
  } catch (err) {
    log.error({ event: event.type, err }, 'webhook delivery error');
  }
}
