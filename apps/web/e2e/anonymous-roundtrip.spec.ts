/**
 * Anonymous upload → URL → anonymous download → byte-level match.
 *
 * Exercises the v1.0 round-trip on the v1.1 resumable transport: a single
 * tiny file goes up via the multi-chunk pipeline (chunk size set in the
 * Playwright config to 64 KiB), and the receiving page decrypts the
 * manifest using the URL fragment key — no password, no wordcode lookup.
 */

import { expect, test } from '@playwright/test';
import {
  clickDownloadFor,
  getShareUrl,
  makeFixture,
  readDownloadAsBuffer,
  setUploadFile,
} from './fixtures.js';

test('anonymous round-trip preserves bytes', async ({ page }) => {
  const fileName = 'roundtrip.bin';
  const original = makeFixture(96 * 1024, 0xa1b2c3d4);

  await page.goto('/');
  await setUploadFile(page, fileName, original);

  // The file row appears once setInputFiles fires the change event.
  await expect(page.getByText(fileName, { exact: false })).toBeVisible();

  // Encrypt + upload. The button label flips between locales; match the
  // role + lock icon container.
  await page.getByRole('button', { name: /Encrypt|Verschlüsseln/i }).click();

  // Result panel signals completion via the "ready" headline + share URL.
  await expect(page.locator('.result h3')).toBeVisible({ timeout: 30_000 });

  const shareUrl = await getShareUrl(page);
  expect(shareUrl).toMatch(/\/d\/[a-f0-9]{24}#k=/);

  // Hop to the download page and grab the single file.
  await page.goto(shareUrl);

  // The download button sits inside the file-entry row once decryption
  // finishes. Wait for the ready-card title before clicking.
  await expect(page.getByRole('heading', { name: /ready|bereit/i })).toBeVisible({
    timeout: 15_000,
  });

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    clickDownloadFor(page, fileName),
  ]);

  expect(download.suggestedFilename()).toBe(fileName);
  const downloaded = await readDownloadAsBuffer(download);
  expect(downloaded.equals(original)).toBe(true);
});
