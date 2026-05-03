/**
 * Shared helpers for the E2E specs.
 *
 * Keep this file deterministic — the three specs in this directory rely
 * on stable fixture bytes so a downloaded file can be compared against
 * the bytes we set on the upload input.
 */

import { Buffer } from 'node:buffer';
import type { Page } from '@playwright/test';

export function makeFixture(sizeBytes: number, seed: number): Buffer {
  const buf = Buffer.alloc(sizeBytes);
  // LCG from `seed` so the bytes are deterministic without dragging in a
  // PRNG dependency. The hash check on the receiving end relies on byte-
  // level equality, not statistical properties.
  let s = seed >>> 0 || 1;
  for (let i = 0; i < sizeBytes; i++) {
    s = (s * 1664525 + 1013904223) >>> 0;
    buf[i] = s & 0xff;
  }
  return buf;
}

export async function setUploadFile(
  page: Page,
  name: string,
  bytes: Buffer,
  mime = 'application/octet-stream',
): Promise<void> {
  // The file <input> is visually hidden behind the dropzone; setInputFiles
  // works regardless of CSS visibility.
  const input = page.locator('input#file-input');
  await input.setInputFiles({ name, mimeType: mime, buffer: bytes });
}

export async function readDownloadAsBuffer(
  download: import('@playwright/test').Download,
): Promise<Buffer> {
  const path = await download.path();
  if (!path) throw new Error('Download has no path on disk');
  const { readFile } = await import('node:fs/promises');
  return readFile(path);
}

/**
 * Pull the share URL out of the result panel. In voice mode the panel
 * renders a wordcode field above the URL field, so the first
 * `.field .val` is the wordcode — scope to `.share-fields` so we always
 * pick up the actual URL field instead.
 */
export async function getShareUrl(page: Page): Promise<string> {
  const url = await page.locator('.share-fields .field .val').first().textContent();
  if (!url) throw new Error('Result panel has no share URL');
  return url.trim();
}

/**
 * Click the per-file Download button on a `/d/<id>` page. The buttons
 * use `aria-label="<filename> <download-i18n>"`, so a plain role/name
 * lookup for "Download" never matches — we resolve the row by its
 * filename text and click the button inside it.
 */
export async function clickDownloadFor(page: Page, fileName: string): Promise<void> {
  const row = page.locator('li.file-entry', { hasText: fileName });
  await row.locator('button.btn-download').click();
}
