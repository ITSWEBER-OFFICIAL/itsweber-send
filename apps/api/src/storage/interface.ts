import type { Readable } from 'node:stream';

/**
 * Pluggable storage backend for ITSWEBER Send.
 *
 * Buffer methods (`put`/`get`) are kept for small artifacts (manifest,
 * meta.json) where one-shot writes are cheaper than streaming. Stream
 * methods (`appendStream`/`getStream`) are used for blob payloads in the
 * resumable upload and Range download paths so neither client nor server
 * needs to hold a full blob in memory. See `docs/V1.1_DECISIONS.md` for
 * the rationale.
 */
export interface StorageAdapter {
  /** Write data under shareId/name, creating the directory if necessary. */
  put(shareId: string, name: string, data: Buffer): Promise<void>;

  /** Read data for shareId/name. Throws if not found. */
  get(shareId: string, name: string): Promise<Buffer>;

  /** Return true if the share directory exists. */
  exists(shareId: string): Promise<boolean>;

  /** Remove the entire share directory and all contained files. */
  delete(shareId: string): Promise<void>;

  /**
   * Scan storage for shares whose meta.json expiresAt is before cutoff.
   * Used by the cleanup job to reconcile storage vs DB.
   */
  expireBefore(cutoff: Date): Promise<string[]>;

  /**
   * Append `source` to `<shareId>/<name>`, creating the file if it does
   * not exist. Used by the resumable upload path to write ciphertext
   * chunks one by one. Resolves with the number of bytes written by this
   * call (not the total file size).
   *
   * `chunkIndex` is the 0-based index of this chunk within the blob. The
   * resumable upload route always passes it; backends like S3 multipart
   * use it as `PartNumber = chunkIndex + 1` to make per-chunk writes
   * idempotent across retries. The filesystem backend ignores it.
   */
  appendStream(
    shareId: string,
    name: string,
    source: Readable,
    chunkIndex?: number,
  ): Promise<{ bytesWritten: number }>;

  /**
   * Mark `<shareId>/<name>` as fully written. For multipart-upload
   * backends (S3) this commits the parts into a single object. The
   * filesystem backend has no commit step and treats this as a no-op.
   * Called by the resumable upload finalize handler once per blob,
   * BEFORE the manifest and meta.json `put` calls. Idempotent.
   */
  finalizeAppend(shareId: string, name: string): Promise<void>;

  /**
   * Total bytes currently stored at `<shareId>/<name>`, or `null` if the
   * file does not exist yet. Used by the resumable upload path to compute
   * resume state and by Range responses to compute Content-Length.
   */
  size(shareId: string, name: string): Promise<number | null>;

  /**
   * Stream `<shareId>/<name>` to the caller. Optional inclusive byte range
   * (`{ start, end }` — both inclusive, like the HTTP Range header). Used
   * by the download path to support Range requests and to avoid loading
   * full blobs into memory.
   */
  getStream(
    shareId: string,
    name: string,
    range?: { start: number; end?: number },
  ): Promise<Readable>;
}
