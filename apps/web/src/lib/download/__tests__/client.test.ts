/**
 * Unit coverage for the buffered-Blob path's size gate.
 *
 * The download UI MUST refuse the buffered Blob path for v2 files beyond
 * `BLOB_FALLBACK_MAX_BYTES`. Pulling a 5+ GB file into a Blob crashes the
 * Chromium / Vivaldi renderer well before the save dialog appears, so a
 * clear "use a Save-File-Picker browser" error is the only correct
 * outcome on FSA-less paths.
 */

import { describe, it, expect } from 'vitest';
import { BLOB_FALLBACK_MAX_BYTES, blobFallbackAllowed } from '../client.js';

describe('blobFallbackAllowed', () => {
  it('always allows v1 files (legacy 500 MB single-shot cap bounds them)', () => {
    expect(blobFallbackAllowed(1, 0)).toBe(true);
    expect(blobFallbackAllowed(1, 1024)).toBe(true);
    expect(blobFallbackAllowed(1, 500 * 1024 * 1024)).toBe(true);
    // Even an over-sized v1 stays allowed — the upload path enforces the
    // ceiling on the way in. We trust the manifest at this point.
    expect(blobFallbackAllowed(1, 10 * 1024 * 1024 * 1024)).toBe(true);
  });

  it('allows v2 files up to and including BLOB_FALLBACK_MAX_BYTES', () => {
    expect(blobFallbackAllowed(2, 0)).toBe(true);
    expect(blobFallbackAllowed(2, 1024 * 1024)).toBe(true);
    expect(blobFallbackAllowed(2, 1.5 * 1024 * 1024 * 1024)).toBe(true);
    expect(blobFallbackAllowed(2, BLOB_FALLBACK_MAX_BYTES)).toBe(true);
  });

  it('refuses v2 files beyond BLOB_FALLBACK_MAX_BYTES', () => {
    expect(blobFallbackAllowed(2, BLOB_FALLBACK_MAX_BYTES + 1)).toBe(false);
    // The reproducer from the bug report: a 5.73 GB MKV.
    expect(blobFallbackAllowed(2, Math.round(5.73 * 1024 * 1024 * 1024))).toBe(false);
    expect(blobFallbackAllowed(2, 50 * 1024 * 1024 * 1024)).toBe(false);
  });

  it('exposes a 2 GiB threshold (deliberately conservative)', () => {
    // Locking in the exact number guards against an accidental loosening
    // — Chromium kills 64-bit renderers below 4 GiB heap and we want the
    // failure mode to be a clear UI message, not "Aw, snap!".
    expect(BLOB_FALLBACK_MAX_BYTES).toBe(2 * 1024 * 1024 * 1024);
  });
});
