/**
 * Web Crypto API wrapper for ITSWEBER Send.
 *
 * Spec: packages/crypto-spec/README.md
 *
 * Primitives used:
 *   - AES-256-GCM  — symmetric cipher, 96-bit IV, 128-bit auth tag
 *   - PBKDF2       — key derivation for password-based wrapping
 *                    SHA-256, 200 000 iterations, 128-bit salt
 *   - base64url    — RFC 4648 §5 encoding for URL fragment and headers
 *
 * The master_key is never sent to the server. It lives only in the URL
 * fragment (#k=<base64url>) on the sender side and in memory on the
 * recipient side.
 *
 * TypeScript note: Web Crypto API requires ArrayBufferView<ArrayBuffer>
 * (not ArrayBufferView<ArrayBufferLike>). All Uint8Array values produced
 * here use `new Uint8Array(n)` or explicit slice/from operations that
 * yield Uint8Array<ArrayBuffer>, satisfying the BufferSource constraint.
 */

// ---------------------------------------------------------------------------
// base64url helpers (RFC 4648 §5 — no padding, URL-safe alphabet)
// ---------------------------------------------------------------------------

export function toBase64url(bytes: Uint8Array): string {
  // Avoid spread (...bytes) which can stack-overflow on large arrays
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i] as number);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function fromBase64url(str: string): Uint8Array<ArrayBuffer> {
  const std = str.replace(/-/g, '+').replace(/_/g, '/');
  const rem = std.length % 4;
  const padded = rem === 0 ? std : std + '==='.slice(0, 4 - rem);
  const binary = atob(padded);
  // new Uint8Array(n) is Uint8Array<ArrayBuffer>, required for WebCrypto BufferSource
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

// ---------------------------------------------------------------------------
// Random
// ---------------------------------------------------------------------------

export function generateIV(): Uint8Array<ArrayBuffer> {
  // new Uint8Array(12) produces Uint8Array<ArrayBuffer> — 96 bits
  const iv = new Uint8Array(12);
  crypto.getRandomValues(iv);
  return iv;
}

// ---------------------------------------------------------------------------
// Master key — 256-bit AES-GCM key
// ---------------------------------------------------------------------------

export async function generateKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
}

export async function exportKeyBase64url(key: CryptoKey): Promise<string> {
  const raw = await crypto.subtle.exportKey('raw', key);
  return toBase64url(new Uint8Array(raw));
}

/** Import a raw base64url key. Set extractable=true only for export on the sender side. */
export async function importKeyBase64url(
  b64: string,
  extractable = false,
): Promise<CryptoKey> {
  const raw = fromBase64url(b64);
  return crypto.subtle.importKey(
    'raw',
    raw,
    { name: 'AES-GCM', length: 256 },
    extractable,
    ['decrypt'],
  );
}

// ---------------------------------------------------------------------------
// Symmetric encrypt / decrypt (AES-256-GCM)
// ---------------------------------------------------------------------------

export async function encrypt(
  key: CryptoKey,
  iv: Uint8Array<ArrayBuffer>,
  data: Uint8Array<ArrayBuffer>,
): Promise<Uint8Array<ArrayBuffer>> {
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, data);
  return new Uint8Array(ciphertext);
}

/**
 * Decrypt using AES-256-GCM.
 * Throws a DOMException (OperationError) on tag verification failure —
 * callers must treat any error as "wrong key or tampered ciphertext".
 */
export async function decrypt(
  key: CryptoKey,
  iv: Uint8Array<ArrayBuffer>,
  ciphertext: Uint8Array<ArrayBuffer>,
): Promise<Uint8Array<ArrayBuffer>> {
  const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
  return new Uint8Array(plaintext);
}

// ---------------------------------------------------------------------------
// Password-based key wrapping
//
// Spec:
//   salt        = random(16 bytes)
//   wrap_key    = PBKDF2(password, salt, 200_000, SHA-256) → 256 bits
//   wrapped_key = AES-GCM-encrypt(master_key_raw, wrap_key, iv_wrap)
// ---------------------------------------------------------------------------

export interface WrappedKeyBundle {
  salt: string;       // base64url, 16 bytes
  ivWrap: string;     // base64url, 12 bytes
  wrappedKey: string; // base64url, 32 + 16 bytes (raw key + GCM auth tag)
}

export async function wrapMasterKey(masterKey: CryptoKey, password: string): Promise<WrappedKeyBundle> {
  const salt = new Uint8Array(16);
  const ivWrap = new Uint8Array(12);
  crypto.getRandomValues(salt);
  crypto.getRandomValues(ivWrap);

  const passwordMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveKey'],
  );

  const wrapKey = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 200_000, hash: 'SHA-256' },
    passwordMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt'],
  );

  // Export master key to raw bytes, then AES-GCM-encrypt it with the derived wrap key
  const masterKeyRaw = await crypto.subtle.exportKey('raw', masterKey);
  const wrappedKeyBuf = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: ivWrap },
    wrapKey,
    masterKeyRaw,
  );

  return {
    salt: toBase64url(salt),
    ivWrap: toBase64url(ivWrap),
    wrappedKey: toBase64url(new Uint8Array(wrappedKeyBuf)),
  };
}

/**
 * Unwrap a master key using the password.
 * Throws if the password is wrong (AES-GCM tag verification fails).
 */
export async function unwrapMasterKey(
  password: string,
  saltB64: string,
  ivWrapB64: string,
  wrappedKeyB64: string,
): Promise<CryptoKey> {
  const salt = fromBase64url(saltB64);
  const ivWrap = fromBase64url(ivWrapB64);
  const wrappedKeyBytes = fromBase64url(wrappedKeyB64);

  const passwordMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveKey'],
  );

  const wrapKey = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 200_000, hash: 'SHA-256' },
    passwordMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt'],
  );

  // Decrypt the wrapped key bytes to recover the raw master key
  const masterKeyRaw = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: ivWrap },
    wrapKey,
    wrappedKeyBytes,
  );

  return crypto.subtle.importKey(
    'raw',
    masterKeyRaw,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt'],
  );
}
