import type { Manifest, ManifestFile } from '@itsweber-send/shared';
import {
  generateKey,
  exportKeyBase64url,
  generateIV,
  encrypt,
  wrapMasterKey,
  toBase64url,
} from '$lib/crypto/index.js';

export type UploadErrorCode = 'http_error' | 'network_error' | 'no_files' | 'invalid_response';

/** Typed upload error — callers inspect `.code` and translate via i18n. */
export class UploadError extends Error {
  readonly code: UploadErrorCode;
  /** HTTP status for `http_error`, otherwise undefined. */
  readonly status?: number;

  constructor(code: UploadErrorCode, options?: { status?: number }) {
    super(code);
    this.name = 'UploadError';
    this.code = code;
    this.status = options?.status;
  }
}

export interface UploadOptions {
  expiryHours: number;
  downloadLimit: number;
  password?: string;
  note?: string;
  onEncryptingStep?: (step: number, total: number) => void;
  onProgress?: (progress: number) => void;
}

export interface UploadResult {
  id: string;
  key: string;
  expiresAt: string;
}

function xhrUpload(
  form: FormData,
  onProgress?: (p: number) => void,
): Promise<{ id: string; expiresAt: string }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable) onProgress?.(e.loaded / e.total);
    });
    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(JSON.parse(xhr.responseText) as { id: string; expiresAt: string });
        } catch {
          reject(new UploadError('invalid_response'));
        }
      } else {
        // Prefer a server-provided error message when available; fall back to typed error.
        try {
          const body = JSON.parse(xhr.responseText) as { error?: string };
          if (body.error) {
            reject(new Error(body.error));
            return;
          }
        } catch {
          /* ignore parse errors */
        }
        reject(new UploadError('http_error', { status: xhr.status }));
      }
    });
    xhr.addEventListener('error', () => reject(new UploadError('network_error')));
    xhr.open('POST', '/api/v1/upload');
    xhr.send(form);
  });
}

export async function uploadFiles(files: File[], options: UploadOptions): Promise<UploadResult> {
  if (files.length === 0) throw new UploadError('no_files');

  const masterKey = await generateKey();
  const keyB64 = await exportKeyBase64url(masterKey);

  const manifestFiles: ManifestFile[] = [];
  const encryptedBlobs: { iv: string; data: Uint8Array<ArrayBuffer> }[] = [];

  for (let i = 0; i < files.length; i++) {
    options.onEncryptingStep?.(i + 1, files.length);
    const file = files[i]!;
    const blobIV = generateIV();
    const fileBytes = new Uint8Array(await file.arrayBuffer());
    const blobCiphertext = await encrypt(masterKey, blobIV, fileBytes);
    const idx = String(i + 1).padStart(4, '0');
    manifestFiles.push({
      name: file.name,
      size: file.size,
      mime: file.type || 'application/octet-stream',
      blobId: `blob-${idx}`,
      iv: toBase64url(blobIV),
    });
    encryptedBlobs.push({ iv: toBase64url(blobIV), data: blobCiphertext });
  }

  const manifest: Manifest = {
    version: 1,
    files: manifestFiles,
    note: options.note?.trim() || null,
  };
  const manifestBytes = new Uint8Array(new TextEncoder().encode(JSON.stringify(manifest)));
  const manifestIV = generateIV();
  const manifestCiphertext = await encrypt(masterKey, manifestIV, manifestBytes);

  const passwordProtected = Boolean(options.password?.trim());
  let salt: string | null = null;
  let ivWrap: string | null = null;
  let wrappedKey: string | null = null;

  if (passwordProtected && options.password) {
    const bundle = await wrapMasterKey(masterKey, options.password);
    salt = bundle.salt;
    ivWrap = bundle.ivWrap;
    wrappedKey = bundle.wrappedKey;
  }

  const totalSizeEncrypted = encryptedBlobs.reduce((s, b) => s + b.data.byteLength, 0);
  const form = new FormData();
  form.append(
    'meta',
    JSON.stringify({
      expiryHours: options.expiryHours,
      downloadLimit: options.downloadLimit,
      passwordProtected,
      salt,
      ivWrap,
      wrappedKey,
      fileCount: files.length,
      totalSizeEncrypted,
    }),
  );
  form.append('manifest-iv', toBase64url(manifestIV));
  form.append(
    'manifest',
    new Blob([manifestCiphertext], { type: 'application/octet-stream' }),
    'manifest',
  );
  for (let i = 0; i < encryptedBlobs.length; i++) {
    const blob = encryptedBlobs[i]!;
    const idx = String(i + 1).padStart(4, '0');
    form.append(`blob-${idx}-iv`, blob.iv);
    form.append(
      `blob-${idx}`,
      new Blob([blob.data], { type: 'application/octet-stream' }),
      `blob-${idx}`,
    );
  }

  const json = await xhrUpload(form, options.onProgress);
  return { id: json.id, key: keyB64, expiresAt: json.expiresAt };
}
