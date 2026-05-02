import type { FastifyBaseLogger } from 'fastify';
import { deleteShare, getExpiredShareIds } from '../db/sqlite.js';
import type { StorageAdapter } from '../storage/interface.js';

export function startCleanupJob(storage: StorageAdapter, log: FastifyBaseLogger): void {
  const run = async (): Promise<void> => {
    const cutoff = new Date();
    const ids = getExpiredShareIds(cutoff);

    if (ids.length === 0) return;

    log.info({ count: ids.length }, 'cleanup: removing expired shares');
    for (const id of ids) {
      try {
        await storage.delete(id);
        deleteShare(id);
      } catch (err) {
        log.error({ shareId: id, err }, 'cleanup: failed to delete share');
      }
    }
  };

  // Run once on startup, then every hour
  void run();
  setInterval(() => void run(), 60 * 60 * 1000);
}
