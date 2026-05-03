/**
 * Resumable upload: pause mid-flight, resume, finalize, download.
 *
 * The Playwright config sets CHUNK_SIZE_BYTES to 64 KiB so a 1 MiB fixture
 * spans 16 chunks. We add ~120 ms latency to every PATCH via route()
 * interception so the test reliably catches the in-flight upload state
 * before the encryption loop completes — without the throttling, a fast
 * localhost finishes the upload before the test can click pause.
 */

import { expect, test } from '@playwright/test';
import {
  clickDownloadFor,
  getShareUrl,
  makeFixture,
  readDownloadAsBuffer,
  setUploadFile,
} from './fixtures.js';

test('resumable upload: pause + resume produces a valid share', async ({ page }) => {
  const fileName = 'resumable.bin';
  // 16 chunks × 64 KiB so we have a comfortable window between PATCHes.
  const original = makeFixture(1024 * 1024, 0xfacefeed);

  // Throttle every chunk PATCH. The route stays installed for the lifetime
  // of the page so resume goes through the same delay.
  await page.route('**/api/v1/uploads/*/blobs/**', async (route) => {
    await new Promise((r) => setTimeout(r, 120));
    await route.continue();
  });

  await page.goto('/');
  await setUploadFile(page, fileName, original);
  await expect(page.getByText(fileName, { exact: false })).toBeVisible();

  await page.getByRole('button', { name: /Encrypt|Verschlüsseln/i }).click();

  // Wait until the per-file row reports an "uploading" badge — that is the
  // only state in which the pause action is rendered. The progress bar
  // only renders while uploading, so capture the percentage NOW before
  // the click flips the row into the paused state and unmounts it.
  const fileRow = page.locator('.file-row').first();
  await expect(fileRow.locator('.badge.badge-busy')).toBeVisible({ timeout: 10_000 });

  const progressMidFlight = await fileRow
    .locator('.progress > span')
    .evaluate((el) => parseFloat((el as HTMLElement).style.width));
  expect(progressMidFlight).toBeGreaterThan(0);
  expect(progressMidFlight).toBeLessThan(100);

  // Click pause. Button is title / aria-label "Pause upload".
  await fileRow.getByRole('button', { name: /Pause upload|Upload pausieren/i }).click();

  // Paused state: the resume button replaces the pause button on the row.
  const resumeBtn = fileRow.getByRole('button', {
    name: /Resume upload|Upload fortsetzen/i,
  });
  await expect(resumeBtn).toBeVisible({ timeout: 5_000 });

  await resumeBtn.click();

  // Wait for finalize → result panel.
  await expect(page.locator('.result h3')).toBeVisible({ timeout: 30_000 });

  const shareUrl = await getShareUrl(page);
  expect(shareUrl).toMatch(/\/d\/[a-f0-9]{24}#k=/);

  // Verify the assembled share decrypts and matches the original bytes.
  await page.goto(shareUrl);
  await expect(page.getByRole('heading', { name: /ready|bereit/i })).toBeVisible({
    timeout: 15_000,
  });

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    clickDownloadFor(page, fileName),
  ]);

  expect(download.suggestedFilename()).toBe(fileName);
  const downloaded = await readDownloadAsBuffer(download);
  expect(downloaded.byteLength).toBe(original.byteLength);
  expect(downloaded.equals(original)).toBe(true);
});
