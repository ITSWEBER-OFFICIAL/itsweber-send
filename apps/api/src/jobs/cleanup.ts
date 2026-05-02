import type { FastifyBaseLogger } from 'fastify';
import {
  deleteShare,
  getExpiredShareIds,
  getExpiredUploadIds,
  deleteUploadInProgress,
} from '../db/sqlite.js';
import type { StorageAdapter } from '../storage/interface.js';

export function startCleanupJob(storage: StorageAdapter, log: FastifyBaseLogger): void {
  const run = async (): Promise<void> => {
    const cutoff = new Date();

    // 1. Remove fully expired shares from DB and storage.
    const expiredShareIds = getExpiredShareIds(cutoff);
    if (expiredShareIds.length > 0) {
      log.info({ count: expiredShareIds.length }, 'cleanup: removing expired shares');
      for (const id of expiredShareIds) {
        try {
          await storage.delete(id);
          deleteShare(id);
        } catch (err) {
          log.error({ shareId: id, err }, 'cleanup: failed to delete share');
        }
      }
    }

    // 2. Remove expired pending resumable uploads. Their reserved share-id
    //    directory holds partial blobs that the client never finalized;
    //    free both the storage and the quota reservation.
    const expiredUploads = getExpiredUploadIds(cutoff);
    if (expiredUploads.length > 0) {
      log.info({ count: expiredUploads.length }, 'cleanup: removing expired pending uploads');
      for (const upload of expiredUploads) {
        try {
          await storage.delete(upload.share_id);
        } catch (err) {
          log.warn(
            { uploadId: upload.id, err },
            'cleanup: storage delete for pending upload failed',
          );
        }
        try {
          deleteUploadInProgress(upload.id);
        } catch (err) {
          log.error({ uploadId: upload.id, err }, 'cleanup: db delete for pending upload failed');
        }
      }
    }
  };

  // Run once on startup, then every hour
  void run();
  setInterval(() => void run(), 60 * 60 * 1000);
}
