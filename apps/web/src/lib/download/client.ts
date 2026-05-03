/**
 * Download client supporting manifest v1 (legacy single-blob AES-GCM)
 * and v2 (chunked AES-GCM, default from v1.1).
 *
 * Two delivery paths exist:
 *   - Buffered Blob (`downloadV1`, `downloadV2`): materialises the full
 *     plaintext in V8 heap before handing it to a `Blob`. Safe for v1
 *     (legacy 500 MB cap) and v2 files up to {@link BLOB_FALLBACK_MAX_BYTES}.
 *   - Streaming-to-disk (`streamV1ToWritable`, `streamV2ToWritable`):
 *     pipes plaintext chunk by chunk into a `FileSystemWritableFileStream`,
 *     so peak RAM stays bounded by the manifest's chunk size regardless
 *     of total file size.
 *
 * Callers MUST gate the buffered path with {@link blobFallbackAllowed} —
 * a v2 file beyond the threshold cannot be decoded into a single Blob
 * without crashing the renderer on 64-bit Chromium / Vivaldi.
 */

import { decrypt, fromBase64url } from '$lib/crypto/index.js';
import type { Manifest, ManifestV2 } from '@itsweber-send/shared';
import { buildV1PlaintextStream, buildV2PlaintextStream } from './zip.js';

/**
 * Largest single-file plaintext the buffered Blob path will accept.
 *
 * Materialising plaintext into a `Blob` requires holding the full
 * plaintext in V8 heap. Chromium kills the renderer well before 4 GiB
 * on 64-bit (process limits, address-space fragmentation), and Vivaldi
 * was observed crashing the tab around 5–6 GB on Windows. The threshold
 * is set deliberately conservatively at 2 GiB so the failure mode is a
 * loud, recoverable error message rather than an "Aw, snap!" page.
 *
 * Callers MUST gate the buffered Blob path on {@link blobFallbackAllowed}
 * before invoking {@link downloadV1} or {@link downloadV2}.
 */
export const BLOB_FALLBACK_MAX_BYTES = 2 * 1024 * 1024 * 1024;

/**
 * Returns true when {@link downloadV1}/{@link downloadV2} can safely
 * deliver the file via the buffered Blob path. v1 is always allowed
 * (the legacy single-shot upload route caps blobs at 500 MB so the
 * recipient cannot be handed anything larger). v2 is allowed up to
 * {@link BLOB_FALLBACK_MAX_BYTES}; beyond that the recipient MUST
 * stream to disk via {@link streamV2ToWritable}.
 */
export function blobFallbackAllowed(manifestVersion: 1 | 2, sizeBytes: number): boolean {
  if (manifestVersion === 1) return true;
  return sizeBytes <= BLOB_FALLBACK_MAX_BYTES;
}

export type DecodedManifest =
  | { version: 1; manifest: Manifest }
  | { version: 2; manifest: ManifestV2 };

export function decodeManifest(plaintextJson: string): DecodedManifest {
  const raw = JSON.parse(plaintextJson) as { version?: number };
  if (raw.version === 1) return { version: 1, manifest: raw as Manifest };
  if (raw.version === 2) return { version: 2, manifest: raw as ManifestV2 };
  throw new Error(`Unknown manifest version: ${String(raw.version)}`);
}

/**
 * v1 single-file fetch + decrypt. Loads the full ciphertext into RAM
 * and runs one AES-GCM call. v1 blobs are bounded by the legacy 500 MB
 * single-shot upload cap, so the buffered path is safe — there is no
 * v1 streaming variant. Throws on auth-tag failure.
 */
export async function downloadV1(
  shareId: string,
  blobNum: number,
  iv: Uint8Array<ArrayBuffer>,
  key: CryptoKey,
): Promise<Uint8Array<ArrayBuffer>> {
  const res = await fetch(`/api/v1/download/${shareId}/blob/${blobNum}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const cipher = new Uint8Array(await res.arrayBuffer());
  return decrypt(key, iv, cipher);
}

/**
 * v2 single-file fetch + decrypt — buffered Blob variant. Streams the
 * blob from the server, decrypts chunk by chunk, and concatenates the
 * plaintexts into a single `Blob`. Peak RAM ≈ 2× file size while the
 * save dialog is open.
 *
 * MUST be gated on {@link blobFallbackAllowed} — calling this for a v2
 * file beyond {@link BLOB_FALLBACK_MAX_BYTES} crashes the renderer.
 * For unrestricted-size v2 delivery use {@link streamV2ToWritable}
 * (File System Access API), which keeps peak RAM bounded by the
 * manifest's chunk size regardless of total file size.
 */
export async function downloadV2(
  shareId: string,
  blobNum: number,
  chunks: { iv: string; cipherSize: number }[],
  mime: string,
  key: CryptoKey,
  onChunkDecoded?: (i: number, total: number) => void,
): Promise<Blob> {
  const res = await fetch(`/api/v1/download/${shareId}/blob/${blobNum}`);
  if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);

  const reader = res.body.getReader();
  const plaintexts: Uint8Array<ArrayBuffer>[] = new Array(chunks.length);

  // Maintain a sliding buffer; drain `cipherSize` bytes per chunk.
  let buffered: Uint8Array<ArrayBuffer> = new Uint8Array(0);
  let chunkIdx = 0;

  while (chunkIdx < chunks.length) {
    const need = chunks[chunkIdx]!.cipherSize;
    while (buffered.byteLength < need) {
      const { value, done } = await reader.read();
      if (done) break;
      if (value) buffered = appendBytes(buffered, value);
    }
    if (buffered.byteLength < need) {
      throw new Error(
        'Truncated blob stream — server delivered fewer bytes than the manifest declares',
      );
    }
    const cipherChunk = buffered.subarray(0, need);
    // Copy out so the underlying buffer can be released as we slice.
    const cipherCopy = new Uint8Array(need);
    cipherCopy.set(cipherChunk);
    buffered = sliceFrom(buffered, need);

    const iv = fromBase64url(chunks[chunkIdx]!.iv);
    plaintexts[chunkIdx] = await decrypt(key, iv, cipherCopy);
    onChunkDecoded?.(chunkIdx + 1, chunks.length);
    chunkIdx += 1;
  }

  // The reader may still hold trailing bytes if the manifest under-
  // declared the blob size; treat that as tampering.
  const tail = await reader.read();
  if (!tail.done && tail.value && tail.value.byteLength > 0) {
    throw new Error('Trailing bytes in blob stream beyond manifest declaration');
  }

  return new Blob(plaintexts as BlobPart[], { type: mime || 'application/octet-stream' });
}

/**
 * v1 streaming-to-disk variant. Decrypts the single-blob ciphertext once
 * and writes the plaintext into the FSA writable. The buffered fetch is
 * unavoidable for v1 (one AES-GCM op over the full blob), but we still
 * skip the second `Blob` materialisation step that the legacy save path
 * required, which halves peak RAM.
 *
 * Throws on auth-tag failure or network truncation; the caller MUST
 * `writable.abort()` to discard the partial file.
 */
export async function streamV1ToWritable(
  shareId: string,
  blobNum: number,
  ivB64: string,
  key: CryptoKey,
  writable: WritableStream<Uint8Array>,
  signal?: AbortSignal,
): Promise<void> {
  await buildV1PlaintextStream(shareId, blobNum, ivB64, key, signal).pipeTo(writable, { signal });
}

/**
 * v2 streaming-to-disk variant. Drains the chunked ciphertext one chunk
 * at a time, decrypts each chunk, and writes the plaintext directly into
 * the FSA writable. Peak RAM is bounded by the manifest's chunk size
 * (default 16 MiB plaintext + 16 B GCM tag), regardless of total file
 * size — a 50 GB file uses the same RAM as a 50 MB file.
 *
 * `onChunkDecoded(chunkIndex, total)` is invoked once per accepted chunk
 * after `pipeTo` has written it to disk, so callers can drive a progress
 * bar. Note `chunkIndex` here is the count of *decoded* chunks (1-based);
 * a 100-chunk file emits values 1..100.
 *
 * Throws on auth-tag failure, truncation, or pipe-to-writable rejection.
 * On any failure path the writable is aborted by the underlying pipeTo
 * (preventClose semantics: a thrown stream rejects pipeTo and aborts the
 * destination) so no partial plaintext is left on disk in a useable state.
 */
export async function streamV2ToWritable(
  shareId: string,
  blobNum: number,
  chunks: { iv: string; cipherSize: number }[],
  key: CryptoKey,
  writable: WritableStream<Uint8Array>,
  signal?: AbortSignal,
  onChunkDecoded?: (chunkIndex: number, total: number) => void,
): Promise<void> {
  await buildV2PlaintextStream(shareId, blobNum, chunks, key, signal, onChunkDecoded).pipeTo(
    writable,
    { signal },
  );
}

function appendBytes(prefix: Uint8Array<ArrayBuffer>, next: Uint8Array): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(prefix.byteLength + next.byteLength);
  out.set(prefix, 0);
  out.set(next, prefix.byteLength);
  return out;
}

function sliceFrom(src: Uint8Array<ArrayBuffer>, offset: number): Uint8Array<ArrayBuffer> {
  if (offset === 0) return src;
  if (offset >= src.byteLength) return new Uint8Array(0);
  const out = new Uint8Array(src.byteLength - offset);
  out.set(src.subarray(offset));
  return out;
}
