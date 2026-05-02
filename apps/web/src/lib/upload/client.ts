import type { Manifest, ManifestFile } from '@itsweber-send/shared';
import {
  generateKey,
  exportKeyBase64url,
  generateIV,
  encrypt,
  wrapMasterKey,
  toBase64url,
} from '$lib/crypto/index.js';

export interface UploadSettings {
  expiryHours: number;
  downloadLimit: number;
  /** Set to a non-empty string to enable password protection. */
  password?: string;
}

export interface UploadResult {
  id: string;
  /** base64url master key — placed in the URL fragment, never sent to server. */
  key: string;
  expiresAt: string;
}

export async function uploadFile(file: File, settings: UploadSettings): Promise<UploadResult> {
  const masterKey = await generateKey();
  const keyB64 = await exportKeyBase64url(masterKey);

  // Encrypt file content
  const blobIV = generateIV();
  // new Uint8Array(ArrayBuffer) → Uint8Array<ArrayBuffer>, required by Web Crypto API
  const fileBytes = new Uint8Array(await file.arrayBuffer());
  const blobCiphertext = await encrypt(masterKey, blobIV, fileBytes);

  // Build plaintext manifest
  const manifestFile: ManifestFile = {
    name: file.name,
    size: file.size,
    mime: file.type || 'application/octet-stream',
    blobId: 'blob-0001',
    iv: toBase64url(blobIV),
  };
  const manifest: Manifest = { version: 1, files: [manifestFile], note: null };
  // TextEncoder.encode() → Uint8Array<ArrayBufferLike>; wrapping via new Uint8Array()
  // copies into a fresh ArrayBuffer, producing Uint8Array<ArrayBuffer> for WebCrypto.
  const manifestBytes = new Uint8Array(new TextEncoder().encode(JSON.stringify(manifest)));

  // Encrypt manifest
  const manifestIV = generateIV();
  const manifestCiphertext = await encrypt(masterKey, manifestIV, manifestBytes);

  // Optional password wrap
  const passwordProtected = Boolean(settings.password?.trim());
  let salt: string | null = null;
  let ivWrap: string | null = null;
  let wrappedKey: string | null = null;

  if (passwordProtected && settings.password) {
    const bundle = await wrapMasterKey(masterKey, settings.password);
    salt = bundle.salt;
    ivWrap = bundle.ivWrap;
    wrappedKey = bundle.wrappedKey;
  }

  // Build multipart form
  const form = new FormData();
  form.append(
    'meta',
    JSON.stringify({
      expiryHours: settings.expiryHours,
      downloadLimit: settings.downloadLimit,
      passwordProtected,
      salt,
      ivWrap,
      wrappedKey,
      fileCount: 1,
      totalSizeEncrypted: blobCiphertext.byteLength,
    }),
  );
  form.append('manifest-iv', toBase64url(manifestIV));
  form.append(
    'manifest',
    new Blob([manifestCiphertext], { type: 'application/octet-stream' }),
    'manifest',
  );
  form.append('blob-0001-iv', toBase64url(blobIV));
  form.append(
    'blob-0001',
    new Blob([blobCiphertext], { type: 'application/octet-stream' }),
    'blob-0001',
  );

  const res = await fetch('/api/v1/upload', { method: 'POST', body: form });

  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(body.error ?? `Upload failed (${res.status})`);
  }

  const json = (await res.json()) as { id: string; expiresAt: string };
  return { id: json.id, key: keyB64, expiresAt: json.expiresAt };
}
