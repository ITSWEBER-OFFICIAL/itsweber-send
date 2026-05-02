// @vitest-environment node
// Node.js 22 exposes the full Web Crypto API as globalThis.crypto

import { describe, it, expect } from 'vitest';
import {
  toBase64url,
  fromBase64url,
  generateKey,
  exportKeyBase64url,
  importKeyBase64url,
  generateIV,
  encrypt,
  decrypt,
  wrapMasterKey,
  unwrapMasterKey,
} from '../index.js';

// ---------------------------------------------------------------------------
// base64url
// ---------------------------------------------------------------------------
describe('base64url', () => {
  it('encodes and decodes roundtrip', () => {
    const original = crypto.getRandomValues(new Uint8Array(32));
    const encoded = toBase64url(original);
    const decoded = fromBase64url(encoded);
    expect(decoded).toEqual(original);
  });

  it('produces URL-safe characters only (no +, /, or =)', () => {
    for (let i = 0; i < 50; i++) {
      const bytes = crypto.getRandomValues(new Uint8Array(Math.floor(Math.random() * 40) + 1));
      const encoded = toBase64url(bytes);
      expect(encoded).not.toMatch(/[+/=]/);
    }
  });

  it('handles empty array', () => {
    expect(toBase64url(new Uint8Array(0))).toBe('');
    expect(fromBase64url('')).toEqual(new Uint8Array(0));
  });
});

// ---------------------------------------------------------------------------
// Key generation / export / import
// ---------------------------------------------------------------------------
describe('key lifecycle', () => {
  it('generates a 256-bit AES-GCM key', async () => {
    const key = await generateKey();
    expect(key.algorithm.name).toBe('AES-GCM');
    expect((key.algorithm as AesKeyGenParams).length).toBe(256);
  });

  it('exports and imports key as base64url, decryption works', async () => {
    const key = await generateKey();
    const b64 = await exportKeyBase64url(key);

    // Key must be 32 bytes = 43 base64url chars (no padding)
    expect(fromBase64url(b64).byteLength).toBe(32);

    const imported = await importKeyBase64url(b64);
    const iv = generateIV();
    const plaintext = new TextEncoder().encode('round-trip');
    const ct = await encrypt(key, iv, plaintext);
    const pt = await decrypt(imported, iv, ct);
    expect(pt).toEqual(plaintext);
  });
});

// ---------------------------------------------------------------------------
// encrypt / decrypt
// ---------------------------------------------------------------------------
describe('AES-256-GCM encrypt/decrypt', () => {
  it('roundtrip with random key and IV', async () => {
    const key = await generateKey();
    const iv = generateIV();
    const plaintext = new TextEncoder().encode('hello, ITSWEBER Send');
    const ciphertext = await encrypt(key, iv, plaintext);
    const decrypted = await decrypt(key, iv, ciphertext);
    expect(decrypted).toEqual(plaintext);
  });

  it('ciphertext differs from plaintext', async () => {
    const key = await generateKey();
    const iv = generateIV();
    const plaintext = new TextEncoder().encode('test data');
    const ciphertext = await encrypt(key, iv, plaintext);
    // Ciphertext should not equal plaintext (GCM adds auth tag → different length too)
    expect(ciphertext).not.toEqual(plaintext);
    expect(ciphertext.byteLength).toBe(plaintext.byteLength + 16); // 16-byte auth tag
  });

  it('wrong key causes decryption failure', async () => {
    const key1 = await generateKey();
    const key2 = await generateKey();
    const iv = generateIV();
    const ct = await encrypt(key1, iv, new TextEncoder().encode('data'));
    await expect(decrypt(key2, iv, ct)).rejects.toThrow();
  });

  it('wrong IV causes decryption failure', async () => {
    const key = await generateKey();
    const iv1 = generateIV();
    const iv2 = generateIV();
    const ct = await encrypt(key, iv1, new TextEncoder().encode('data'));
    await expect(decrypt(key, iv2, ct)).rejects.toThrow();
  });

  it('bit-flip in ciphertext causes decryption failure (tampering detection)', async () => {
    const key = await generateKey();
    const iv = generateIV();
    const ct = await encrypt(key, iv, new TextEncoder().encode('tamper test'));
    ct[0] ^= 0xff;
    await expect(decrypt(key, iv, ct)).rejects.toThrow();
  });

  it('bit-flip in auth tag causes decryption failure', async () => {
    const key = await generateKey();
    const iv = generateIV();
    const ct = await encrypt(key, iv, new TextEncoder().encode('auth tag test'));
    ct[ct.length - 1] ^= 0x01;
    await expect(decrypt(key, iv, ct)).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// IV generation
// ---------------------------------------------------------------------------
describe('IV generation', () => {
  it('generates 96-bit (12-byte) IVs', () => {
    const iv = generateIV();
    expect(iv.byteLength).toBe(12);
  });

  it('two IVs are not equal', () => {
    const iv1 = generateIV();
    const iv2 = generateIV();
    expect(iv1).not.toEqual(iv2);
  });
});

// ---------------------------------------------------------------------------
// Password-based key wrapping (PBKDF2 + AES-GCM)
// ---------------------------------------------------------------------------
describe('password key wrap / unwrap', () => {
  it('correct password: unwrapped key decrypts ciphertext encrypted with original', async () => {
    const masterKey = await generateKey();
    const bundle = await wrapMasterKey(masterKey, 'correct-password');

    expect(bundle.salt.length).toBeGreaterThan(0);
    expect(bundle.ivWrap.length).toBeGreaterThan(0);
    expect(bundle.wrappedKey.length).toBeGreaterThan(0);

    const unwrapped = await unwrapMasterKey(
      'correct-password',
      bundle.salt,
      bundle.ivWrap,
      bundle.wrappedKey,
    );

    const iv = generateIV();
    const plaintext = new TextEncoder().encode('password-protected file');
    const ct = await encrypt(masterKey, iv, plaintext);
    const pt = await decrypt(unwrapped, iv, ct);
    expect(pt).toEqual(plaintext);
  });

  it('wrong password causes unwrap failure', async () => {
    const masterKey = await generateKey();
    const bundle = await wrapMasterKey(masterKey, 'secret123');
    await expect(
      unwrapMasterKey('wrong-password', bundle.salt, bundle.ivWrap, bundle.wrappedKey),
    ).rejects.toThrow();
  });

  it('salt is 16 bytes encoded as base64url', async () => {
    const masterKey = await generateKey();
    const bundle = await wrapMasterKey(masterKey, 'pw');
    expect(fromBase64url(bundle.salt).byteLength).toBe(16);
  });

  it('ivWrap is 12 bytes encoded as base64url', async () => {
    const masterKey = await generateKey();
    const bundle = await wrapMasterKey(masterKey, 'pw');
    expect(fromBase64url(bundle.ivWrap).byteLength).toBe(12);
  });
});
