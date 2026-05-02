// @vitest-environment node
// Node 22 exposes Web Crypto on globalThis.crypto

import { describe, it, expect } from 'vitest';
import { generateKey, exportKeyBase64url, importKeyBase64url, fromBase64url } from '../index.js';
import { planFileChunks, encryptFileChunk, decryptChunk } from '../chunked.js';

// Minimal Blob shim — Node's global Blob is sufficient for slice + arrayBuffer.

describe('planFileChunks', () => {
  it('splits a multiple-of-chunk-size file evenly', () => {
    const plan = planFileChunks(40, 16, 'blob-0001');
    expect(plan.chunks).toHaveLength(3);
    expect(plan.chunks[0]).toEqual({ offsetPlain: 0, sizePlain: 16 });
    expect(plan.chunks[1]).toEqual({ offsetPlain: 16, sizePlain: 16 });
    expect(plan.chunks[2]).toEqual({ offsetPlain: 32, sizePlain: 8 });
    // cipherSize = sum(plain + 16-byte GCM tag)
    expect(plan.cipherSize).toBe(16 + 16 + 16 + 16 + 8 + 16);
  });

  it('produces a single empty chunk for a zero-byte file', () => {
    const plan = planFileChunks(0, 16, 'blob-0001');
    expect(plan.chunks).toHaveLength(1);
    expect(plan.chunks[0]).toEqual({ offsetPlain: 0, sizePlain: 0 });
    expect(plan.cipherSize).toBe(16); // just the GCM auth tag
  });

  it('rejects non-positive chunkSize', () => {
    expect(() => planFileChunks(10, 0, 'blob-0001')).toThrow();
  });
});

describe('chunked AES-GCM roundtrip', () => {
  it('encrypts each chunk with a unique IV that decrypts back', async () => {
    const key = await generateKey();
    const file = new Blob([crypto.getRandomValues(new Uint8Array(50))]);
    const plan = planFileChunks(file.size, 16, 'blob-0001');

    const ciphertexts: Uint8Array[] = [];
    const ivs: string[] = [];
    for (const chunk of plan.chunks) {
      const enc = await encryptFileChunk(key, file, chunk);
      ciphertexts.push(enc.cipher);
      ivs.push(enc.ivB64);
    }
    // unique IVs
    expect(new Set(ivs).size).toBe(ivs.length);

    // Decrypt each chunk back
    const reassembled = new Uint8Array(file.size);
    let offset = 0;
    for (let i = 0; i < ciphertexts.length; i++) {
      const iv = fromBase64url(ivs[i]!);
      const cipher = ciphertexts[i]!;
      const plain = await decryptChunk(key, iv, new Uint8Array(cipher));
      reassembled.set(plain, offset);
      offset += plain.byteLength;
    }
    const original = new Uint8Array(await file.arrayBuffer());
    expect(reassembled).toEqual(original);
  });

  it('a wrong IV fails the auth tag check', async () => {
    const key = await generateKey();
    const file = new Blob([crypto.getRandomValues(new Uint8Array(32))]);
    const plan = planFileChunks(file.size, 32, 'blob-0001');
    const enc = await encryptFileChunk(key, file, plan.chunks[0]!);
    const wrongIv = new Uint8Array(12);
    crypto.getRandomValues(wrongIv);
    await expect(decryptChunk(key, wrongIv, new Uint8Array(enc.cipher))).rejects.toThrow();
  });

  it('cross-key decrypt fails', async () => {
    const k1 = await generateKey();
    const k2 = await generateKey();
    const file = new Blob([crypto.getRandomValues(new Uint8Array(32))]);
    const plan = planFileChunks(file.size, 32, 'blob-0001');
    const enc = await encryptFileChunk(k1, file, plan.chunks[0]!);
    const iv = fromBase64url(enc.ivB64);
    await expect(decryptChunk(k2, iv, new Uint8Array(enc.cipher))).rejects.toThrow();
  });

  it('exported and re-imported key still decrypts the chunks', async () => {
    const original = await generateKey();
    const exported = await exportKeyBase64url(original);
    const reimported = await importKeyBase64url(exported);

    const file = new Blob([crypto.getRandomValues(new Uint8Array(20))]);
    const plan = planFileChunks(file.size, 8, 'blob-0001');
    const enc = await encryptFileChunk(original, file, plan.chunks[0]!);
    const iv = fromBase64url(enc.ivB64);
    await expect(decryptChunk(reimported, iv, new Uint8Array(enc.cipher))).resolves.toBeInstanceOf(
      Uint8Array,
    );
  });
});
