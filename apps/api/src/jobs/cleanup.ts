import type { FastifyBaseLogger } from 'fastify';
import {
  deleteShare,
  deleteExpiredSessions,
  getExpiredShareIds,
  getExpiredUploadIds,
  deleteUploadInProgress,
  getAllShareIdSet,
  getAllPendingUploadShareIdSet,
} from '../db/sqlite.js';
import type { StorageAdapter } from '../storage/interface.js';

export interface CleanupOutcome {
  expiredShares: number;
  expiredUploads: number;
  expiredSessions: boolean;
  reconciledOrphans: number;
}

export async function runCleanupOnce(
  storage: StorageAdapter,
  log: Pick<FastifyBaseLogger, 'info' | 'warn' | 'error'>,
): Promise<CleanupOutcome> {
  const outcome: CleanupOutcome = {
    expiredShares: 0,
    expiredUploads: 0,
    expiredSessions: false,
    reconciledOrphans: 0,
  };
  const cutoff = new Date();

  // 1. Remove fully expired shares from DB and storage.
  const expiredShareIds = getExpiredShareIds(cutoff);
  if (expiredShareIds.length > 0) {
    log.info({ count: expiredShareIds.length }, 'cleanup: removing expired shares');
    for (const id of expiredShareIds) {
      try {
        await storage.delete(id);
        deleteShare(id);
        outcome.expiredShares += 1;
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
        log.warn({ uploadId: upload.id, err }, 'cleanup: storage delete for pending upload failed');
      }
      try {
        deleteUploadInProgress(upload.id);
        outcome.expiredUploads += 1;
      } catch (err) {
        log.error({ uploadId: upload.id, err }, 'cleanup: db delete for pending upload failed');
      }
    }
  }

  // 3. Drop expired sessions. (Cookies still expire client-side, but the
  //    DB row would otherwise live forever and grow the sessions table.)
  try {
    deleteExpiredSessions();
    outcome.expiredSessions = true;
  } catch (err) {
    log.error({ err }, 'cleanup: deleteExpiredSessions failed');
  }

  // 4. Storage-orphan reconciliation: any share-id present on storage but
  //    absent from the DB (and not currently a pending upload's reserved
  //    slot) is a leftover from a crashed delete or manual intervention.
  //    Drop it so the bytes/object aren't retained indefinitely.
  try {
    const known = getAllShareIdSet();
    const pending = getAllPendingUploadShareIdSet();
    const onDisk = await storage.listShareIds();
    const orphans = onDisk.filter((id) => !known.has(id) && !pending.has(id));
    if (orphans.length > 0) {
      log.info({ count: orphans.length }, 'cleanup: reconciling storage orphans');
      for (const id of orphans) {
        try {
          await storage.delete(id);
          outcome.reconciledOrphans += 1;
        } catch (err) {
          log.warn({ shareId: id, err }, 'cleanup: orphan delete failed');
        }
      }
    }
  } catch (err) {
    log.error({ err }, 'cleanup: orphan-reconciliation pass failed');
  }

  return outcome;
}

export function startCleanupJob(storage: StorageAdapter, log: FastifyBaseLogger): void {
  // Run once on startup, then every hour. Errors inside `runCleanupOnce`
  // are already caught and logged per-step; a top-level catch here guards
  // against a programming error that escapes those.
  const tick = (): void => {
    void runCleanupOnce(storage, log).catch((err) =>
      log.error({ err }, 'cleanup: unhandled error'),
    );
  };
  tick();
  setInterval(tick, 60 * 60 * 1000);
}
