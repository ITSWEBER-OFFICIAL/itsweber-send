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
 * Returns true when the current browser exposes `showSaveFilePicker` AND
 * is not running under WebDriver automation. Headless Chromium under
 * Playwright has the picker symbol defined but the call hangs without a
 * user-gesture pump, so the safer behaviour for tests is to take the
 * buffered Blob path. SSR-safe (returns false on the server).
 */
export function supportsFileSystemAccess(): boolean {
  if (typeof globalThis === 'undefined') return false;
  if (typeof (globalThis as { showSaveFilePicker?: unknown }).showSaveFilePicker !== 'function') {
    return false;
  }
  // navigator.webdriver is set to true by every WebDriver-compatible
  // automation runtime (Playwright, Selenium, Puppeteer with the bypass
  // off). End users should never see this flag, so gating FSA on its
  // absence is a clean way to keep the production path while letting
  // tests deterministically exercise the blob fallback.
  const nav = (globalThis as { navigator?: { webdriver?: boolean } }).navigator;
  if (nav?.webdriver === true) return false;
  return true;
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
  return pickSaveDestination(suggestedName, 'ZIP archive', 'application/zip', '.zip');
}

/**
 * Generic FSA save-file picker. Used for single-file streaming downloads —
 * the recipient picks the destination, the browser writes plaintext chunk
 * by chunk straight to disk. Falls back to `null` on user cancel, throws
 * if the API is missing (callers should gate via {@link supportsFileSystemAccess}).
 */
export async function pickFileDestination(
  suggestedName: string,
  mime: string,
): Promise<WritableStream<Uint8Array> | null> {
  const ext = extractExtension(suggestedName);
  // The accept dict needs at least one entry per type; an empty list trips
  // some browsers. Fall back to a bare octet-stream when no extension is
  // recognisable — the user can still rename the file in the dialog.
  const accept: Record<string, string[]> = {};
  if (ext) accept[mime || 'application/octet-stream'] = [ext];
  const description = ext ? `${ext.slice(1).toUpperCase()} file` : 'File';
  return pickSaveDestination(suggestedName, description, mime || 'application/octet-stream', ext);
}

async function pickSaveDestination(
  suggestedName: string,
  description: string,
  mime: string,
  ext: string,
): Promise<WritableStream<Uint8Array> | null> {
  type ShowSaveFilePicker = (opts: FilePickerOptions) => Promise<FilePickerResultLike>;
  const fn = (globalThis as { showSaveFilePicker?: ShowSaveFilePicker }).showSaveFilePicker;
  if (typeof fn !== 'function') {
    throw new Error('File System Access API not supported');
  }
  const types: FilePickerOptions['types'] = ext
    ? [{ description, accept: { [mime]: [ext] } }]
    : undefined;
  let handle: FilePickerResultLike;
  try {
    handle = await fn({ suggestedName, types });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') return null;
    throw err;
  }
  return handle.createWritable();
}

function extractExtension(name: string): string {
  const dot = name.lastIndexOf('.');
  if (dot < 0 || dot === name.length - 1) return '';
  // Accept any extension up to 8 chars; longer suffixes are likely names
  // with embedded dots (e.g. archive.tar.gz keeps `.gz`).
  const ext = name.slice(dot);
  return ext.length <= 9 ? ext : '';
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
  onChunkDecoded?: (chunkIndex: number, total: number) => void,
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
        onChunkDecoded?.(chunkIdx, chunks.length);
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
