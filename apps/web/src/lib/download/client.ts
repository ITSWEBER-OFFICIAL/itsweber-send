/**
 * Download client supporting manifest v1 (legacy single-blob AES-GCM)
 * and v2 (chunked AES-GCM, default from v1.1).
 *
 * v1: one AES-GCM call per file, IV from `manifest.files[].iv`.
 * v2: stream-decrypt chunk by chunk; each chunk's `cipherSize` worth
 *     of bytes from the blob stream is one AES-GCM ciphertext with the
 *     IV from `manifest.files[].chunks[i].iv`. The decoded plaintext is
 *     concatenated into the final file.
 *
 * For the buffer-and-save path used by the current download UI, the
 * full plaintext lives in memory once before being handed to a Blob.
 * The streaming-to-disk path (File System Access API) is part of Block
 * B (ZIP streaming) in the next iteration; v1.1 first cut uses this
 * buffered path so single-file v2 decryption works end to end.
 */

import { decrypt, fromBase64url } from '$lib/crypto/index.js';
import type { Manifest, ManifestV2 } from '@itsweber-send/shared';

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
 * and runs one AES-GCM call. Throws on auth-tag failure.
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
 * v2 single-file fetch + decrypt. Streams the blob from the server,
 * reads `chunks[i].cipherSize` bytes per chunk, decrypts each chunk,
 * and assembles the result. Aborts on the first chunk that fails the
 * AES-GCM auth tag check.
 *
 * Returns a `Blob` so the caller can save it via `URL.createObjectURL`
 * exactly like the v1 path. The Blob's parts are individual chunk
 * plaintexts — the JS engine concatenates them lazily, but a final
 * `URL.createObjectURL` materialises them, so peak RAM is roughly
 * 2 × file size for the duration of the save dialog. Streaming to disk
 * via File System Access API ships in Block B.
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
