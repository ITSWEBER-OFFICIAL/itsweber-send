/**
 * Chunked AES-GCM helpers for manifest v2.
 *
 * Spec: packages/crypto-spec/README.md (manifest v2 section).
 *
 * Each chunk is its own AES-GCM ciphertext with a unique 96-bit IV. The
 * chunks are concatenated on the wire (server stores `blob-NNNN` as a
 * single byte sequence with no separators); the per-chunk IV and cipher
 * size live inside the encrypted manifest.
 *
 * Defaults match the server announcement (`config.uploads.chunkSizeBytes`,
 * 16 MiB plaintext). The server's `POST /api/v1/uploads` reply is the
 * authoritative source — read `chunkSize` from it instead of hardcoding.
 */

import { encrypt, decrypt, generateIV, toBase64url } from './index.js';

export interface PlannedChunk {
  /** Plaintext byte offset where this chunk starts within the file. */
  offsetPlain: number;
  /** Plaintext byte length of this chunk. */
  sizePlain: number;
}

export interface EncryptedChunk {
  /** 12-byte IV, base64url-encoded — written into the manifest. */
  ivB64: string;
  /** Ciphertext (= plaintext + 16-byte GCM auth tag). */
  cipher: Uint8Array<ArrayBuffer>;
}

export interface ChunkPlanFile {
  blobId: string;
  chunkSize: number;
  /** Cumulative ciphertext bytes the server will receive for this blob. */
  cipherSize: number;
  chunks: PlannedChunk[];
}

/**
 * Plan how a `File` will be split into chunks at the given chunk size,
 * without doing any encryption yet. Used to compute the `cipherSize` /
 * `chunkCount` declarations for `POST /api/v1/uploads` so the server can
 * reserve quota and validate per-chunk PATCHes.
 */
export function planFileChunks(fileSize: number, chunkSize: number, blobId: string): ChunkPlanFile {
  if (chunkSize <= 0) throw new Error('chunkSize must be positive');
  const chunks: PlannedChunk[] = [];
  let offset = 0;
  if (fileSize === 0) {
    // Empty file gets a single empty chunk so the on-disk blob still
    // carries the GCM auth tag and the manifest stays well-formed.
    chunks.push({ offsetPlain: 0, sizePlain: 0 });
  } else {
    while (offset < fileSize) {
      const sizePlain = Math.min(chunkSize, fileSize - offset);
      chunks.push({ offsetPlain: offset, sizePlain });
      offset += sizePlain;
    }
  }
  // Each chunk's ciphertext = plaintext bytes + 16-byte GCM auth tag.
  const cipherSize = chunks.reduce((s, c) => s + c.sizePlain + 16, 0);
  return { blobId, chunkSize, cipherSize, chunks };
}

/**
 * Encrypt one chunk of a `File` using a fresh random IV. Returns the
 * ciphertext (to PATCH to the server) and the IV (to record in the
 * manifest). Reads only `chunk.sizePlain` bytes from disk via
 * `Blob.slice` — never loads the full file into memory.
 */
export async function encryptFileChunk(
  key: CryptoKey,
  file: Blob,
  chunk: PlannedChunk,
): Promise<EncryptedChunk> {
  const slice = file.slice(chunk.offsetPlain, chunk.offsetPlain + chunk.sizePlain);
  const plaintext = new Uint8Array(await slice.arrayBuffer());
  const iv = generateIV();
  const cipher = await encrypt(key, iv, plaintext);
  return { ivB64: toBase64url(iv), cipher };
}

/**
 * Decrypt one chunk in the v2 download path. The caller has already read
 * `cipherSize` bytes from the blob stream; `iv` came from the encrypted
 * manifest. Throws on auth-tag failure.
 */
export async function decryptChunk(
  key: CryptoKey,
  iv: Uint8Array<ArrayBuffer>,
  cipher: Uint8Array<ArrayBuffer>,
): Promise<Uint8Array<ArrayBuffer>> {
  return decrypt(key, iv, cipher);
}
