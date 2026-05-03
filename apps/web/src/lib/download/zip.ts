/**
 * ZIP-streaming download for multi-file shares (Block B, v1.1).
 *
 * Strategy:
 *   1. The recipient picks a save destination via the File System Access API
 *      (`showSaveFilePicker`). The returned `FileSystemWritableFileStream` is
 *      a real WritableStream, so the browser writes directly to disk — no
 *      in-memory ZIP build, no 2× file-size RAM peak.
 *   2. For each file in the manifest we build a `ReadableStream<Uint8Array>`
 *      that fetches the encrypted blob and emits decrypted plaintext in
 *      chunk order (v2: walk the manifest's chunk array and stream-decrypt;
 *      v1: single AES-GCM call buffered into one stream chunk).
 *   3. `client-zip`'s `makeZip` consumes the entries one at a time and emits
 *      a ZIP byte stream which we `pipeTo` the FSA writable.
 *
 * Auth-tag failures abort the ReadableStream → propagate through the ZIP
 * encoder → the FSA writable is aborted → the partial ZIP file is left for
 * the user to discard. We never deliver mis-authenticated plaintext.
 *
 * Browsers without the File System Access API (Safari, Firefox) MUST NOT
 * use this path — the caller is expected to gate on `supportsFileSystemAccess()`
 * and fall back to per-file downloads. We deliberately skip an in-memory
 * Blob fallback to avoid OOM on large multi-file shares.
 *
 * Download-limit accounting: the server increments `downloads_used` once,
 * on the full (non-Range) read of the LAST blob. Streaming all blobs in
 * order via this path triggers exactly one increment per share-download,
 * matching the spec in `docs/V1.1_DECISIONS.md` §6.
 */

import { makeZip } from 'client-zip';
import type { Manifest, ManifestV2 } from '@itsweber-send/shared';
import { decrypt, fromBase64url } from '$lib/crypto/index.js';

export type DecodedManifest =
  | { version: 1; manifest: Manifest }
  | { version: 2; manifest: ManifestV2 };

export interface ZipProgress {
  /** 0-based index of the file currently being streamed. */
  fileIndex: number;
  /** Total number of files in the share. */
  fileCount: number;
  /** Plaintext name of the file currently being streamed. */
  fileName: string;
}

/**
 * Returns true when the current browser exposes `showSaveFilePicker`.
 * SSR-safe (returns false on the server).
 */
export function supportsFileSystemAccess(): boolean {
  return (
    typeof globalThis !== 'undefined' &&
    typeof (globalThis as { showSaveFilePicker?: unknown }).showSaveFilePicker === 'function'
  );
}

interface FilePickerOptions {
  suggestedName?: string;
  types?: { description: string; accept: Record<string, string[]> }[];
}

interface FilePickerResultLike {
  createWritable(): Promise<WritableStream<Uint8Array>>;
}

/**
 * Open the FSA save-file picker. Throws if the API is missing. Returns
 * `null` if the user cancels (FSA throws `AbortError` in that case, which
 * we translate to `null` so the caller can no-op without an error toast).
 */
export async function pickZipDestination(
  suggestedName: string,
): Promise<WritableStream<Uint8Array> | null> {
  type ShowSaveFilePicker = (opts: FilePickerOptions) => Promise<FilePickerResultLike>;
  const fn = (globalThis as { showSaveFilePicker?: ShowSaveFilePicker }).showSaveFilePicker;
  if (typeof fn !== 'function') {
    throw new Error('File System Access API not supported');
  }
  let handle: FilePickerResultLike;
  try {
    handle = await fn({
      suggestedName,
      types: [{ description: 'ZIP archive', accept: { 'application/zip': ['.zip'] } }],
    });
  } catch (err) {
    // User cancelled the picker → AbortError. Anything else is unexpected.
    if (err instanceof DOMException && err.name === 'AbortError') return null;
    throw err;
  }
  return handle.createWritable();
}

/**
 * Build a `ReadableStream<Uint8Array>` that emits the decrypted plaintext
 * of one v2 file. The stream pulls ciphertext from
 * `/api/v1/download/<shareId>/blob/<blobNum>`, drains exactly
 * `chunks[i].cipherSize` bytes per chunk, decrypts with the matching IV,
 * and enqueues the plaintext. Aborts on auth-tag failure or truncation.
 */
export function buildV2PlaintextStream(
  shareId: string,
  blobNum: number,
  chunks: { iv: string; cipherSize: number }[],
  key: CryptoKey,
  signal?: AbortSignal,
): ReadableStream<Uint8Array> {
  let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  let chunkIdx = 0;
  // Queue of received but not-yet-consumed ciphertext chunks. Avoids the
  // O(N²) buffer-concat cost of `new Uint8Array(prev + next)` on every
  // fetch read.
  const pending: Uint8Array[] = [];
  let pendingBytes = 0;

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        const res = await fetch(`/api/v1/download/${shareId}/blob/${blobNum}`, { signal });
        if (!res.ok || !res.body) {
          controller.error(new Error(`HTTP ${res.status}`));
          return;
        }
        reader = res.body.getReader();
      } catch (err) {
        controller.error(err);
      }
    },
    async pull(controller) {
      if (!reader) {
        controller.error(new Error('Stream reader not initialized'));
        return;
      }
      if (chunkIdx >= chunks.length) {
        // Residual bytes in our local queue OR still pending on the reader
        // both mean the blob is longer than the manifest declares — refuse
        // to deliver any of it.
        if (pendingBytes > 0) {
          controller.error(new Error('Trailing bytes in blob stream beyond manifest declaration'));
          return;
        }
        const tail = await reader.read();
        if (!tail.done && tail.value && tail.value.byteLength > 0) {
          controller.error(new Error('Trailing bytes in blob stream beyond manifest declaration'));
          return;
        }
        controller.close();
        return;
      }
      const need = chunks[chunkIdx]!.cipherSize;
      while (pendingBytes < need) {
        const { value, done } = await reader.read();
        if (done) break;
        if (value && value.byteLength > 0) {
          pending.push(value);
          pendingBytes += value.byteLength;
        }
      }
      if (pendingBytes < need) {
        controller.error(
          new Error('Truncated blob stream — server delivered fewer bytes than declared'),
        );
        return;
      }
      const cipher = new Uint8Array(need);
      let written = 0;
      while (written < need) {
        const head = pending[0]!;
        const remaining = need - written;
        if (head.byteLength <= remaining) {
          cipher.set(head, written);
          written += head.byteLength;
          pending.shift();
        } else {
          cipher.set(head.subarray(0, remaining), written);
          pending[0] = head.subarray(remaining);
          written = need;
        }
      }
      pendingBytes -= need;
      try {
        const iv = fromBase64url(chunks[chunkIdx]!.iv);
        const plaintext = await decrypt(key, iv, cipher);
        controller.enqueue(plaintext);
        chunkIdx += 1;
      } catch (err) {
        controller.error(err);
      }
    },
    cancel() {
      reader?.cancel().catch(() => {});
    },
  });
}

/**
 * Build a `ReadableStream<Uint8Array>` that emits the decrypted plaintext
 * of one v1 file. v1 files are a single AES-GCM ciphertext over the whole
 * blob — we fetch the full ciphertext into memory, decrypt once, emit one
 * chunk. v1 is capped at the legacy single-shot limit (500 MB by default),
 * so the transient peak is bounded.
 */
export function buildV1PlaintextStream(
  shareId: string,
  blobNum: number,
  ivB64: string,
  key: CryptoKey,
  signal?: AbortSignal,
): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        const res = await fetch(`/api/v1/download/${shareId}/blob/${blobNum}`, { signal });
        if (!res.ok) {
          controller.error(new Error(`HTTP ${res.status}`));
          return;
        }
        const cipher = new Uint8Array(await res.arrayBuffer());
        const iv = fromBase64url(ivB64);
        const plaintext = await decrypt(key, iv, cipher);
        controller.enqueue(plaintext);
        controller.close();
      } catch (err) {
        controller.error(err);
      }
    },
  });
}

/**
 * Stream every file in the share as a single ZIP into the provided
 * writable stream. Files are processed sequentially in manifest order,
 * matching the order required to trigger exactly one server-side
 * download-counter increment on the last blob.
 *
 * `onProgress` is invoked once per file boundary, before the file's bytes
 * start streaming.
 *
 * Throws if any chunk fails authentication, the network truncates a blob,
 * or the writable rejects writes (e.g. user cancels mid-save).
 */
export async function streamShareAsZip(
  shareId: string,
  decoded: DecodedManifest,
  key: CryptoKey,
  writable: WritableStream<Uint8Array>,
  onProgress?: (p: ZipProgress) => void,
  signal?: AbortSignal,
): Promise<void> {
  const files = decoded.manifest.files;
  const fileCount = files.length;
  const lastModified = new Date();

  type ZipEntry = {
    input: ReadableStream<Uint8Array>;
    name: string;
    size: number;
    lastModified: Date;
  };

  async function* entries(): AsyncGenerator<ZipEntry> {
    for (let i = 0; i < fileCount; i++) {
      const file = files[i]!;
      onProgress?.({ fileIndex: i, fileCount, fileName: file.name });
      const blobNum = parseInt(file.blobId.replace('blob-', ''), 10);
      let stream: ReadableStream<Uint8Array>;
      if (decoded.version === 2) {
        const v2 = file as ManifestV2['files'][number];
        stream = buildV2PlaintextStream(shareId, blobNum, v2.chunks, key, signal);
      } else {
        const v1 = file as Manifest['files'][number];
        stream = buildV1PlaintextStream(shareId, blobNum, v1.iv, key, signal);
      }
      yield {
        input: stream,
        name: file.name,
        size: file.size,
        lastModified,
      };
    }
  }

  const zipStream = makeZip(entries());
  await zipStream.pipeTo(writable, { signal });
}
