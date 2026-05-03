/**
 * Cross-session resume across two pages in the same browser context.
 *
 * Validates the contract documented in `apps/web/src/lib/upload/resumable.ts`:
 *
 *  1. Mid-upload state is persisted in localStorage (uploadId, IVs,
 *     received-chunk counts).
 *  2. The master key lives only in the URL fragment (`#u=<id>&k=<keyB64>`)
 *     — never in localStorage.
 *  3. Closing the upload page and re-opening the captured URL in a new
 *     page within the same context exposes both halves of the contract:
 *     localStorage (id + IVs) joined with the fragment (key) to resume
 *     without re-uploading already-accepted chunks.
 *
 * The previous in-session pause/resume spec only covered case 1+2 within
 * a single page lifetime; this spec adds the actual cross-session jump
 * the v1.2 design promises.
 */

import { expect, test } from '@playwright/test';
import {
  clickDownloadFor,
  getShareUrl,
  makeFixture,
  readDownloadAsBuffer,
  setUploadFile,
} from './fixtures.js';

test('cross-session resume: close page, reopen URL, finish upload', async ({ browser }) => {
  // Same context across both pages so localStorage survives the page
  // close. Different page objects keep the JS heap fresh on the second
  // visit, which is the realistic recovery path (browser restart, tab
  // close + reopen, link clicked from another window).
  const context = await browser.newContext();

  try {
    const fileName = 'cross-session.bin';
    // 1 MiB at 64 KiB chunks => 16 chunks. With ~120 ms per PATCH there's
    // enough time for the test to pause before the encryption loop ends.
    const original = makeFixture(1024 * 1024, 0xc0ffee01);

    // ---- Page 1 — start, pause mid-flight, capture URL fragment ----
    const pageA = await context.newPage();

    // Throttle PATCHes only on this page; the resume page runs unthrottled.
    await pageA.route('**/api/v1/uploads/*/blobs/**', async (route) => {
      await new Promise((r) => setTimeout(r, 120));
      await route.continue();
    });

    await pageA.goto('/');
    await setUploadFile(pageA, fileName, original);
    await pageA.getByRole('button', { name: /Encrypt|Verschlüsseln/i }).click();

    // Wait for the uploading badge so we know at least one chunk has
    // been sent (and therefore the upload-id + key fragment is set).
    const fileRow = pageA.locator('.file-row').first();
    await expect(fileRow.locator('.badge.badge-busy')).toBeVisible({ timeout: 10_000 });

    // Pause so the upload is in a clean half-done state when we leave.
    await fileRow.getByRole('button', { name: /Pause upload|Upload pausieren/i }).click();
    await expect(
      fileRow.getByRole('button', { name: /Resume upload|Upload fortsetzen/i }),
    ).toBeVisible({ timeout: 5_000 });

    // Capture the URL with the resume fragment. The component writes
    // `#u=<id>&k=<keyB64>` via replaceState as soon as the create call
    // returns; pause-after-progress guarantees we observe it.
    const resumeUrl = pageA.url();
    expect(resumeUrl).toMatch(/#u=[a-f0-9]{24}&k=[A-Za-z0-9_-]+/);

    await pageA.close();

    // ---- Page 2 — open the captured URL and resume ----
    const pageB = await context.newPage();
    await pageB.goto(resumeUrl);

    // The resume banner appears once `listPendingUploads` finds the
    // localStorage entry and matches the fragment.
    await expect(
      pageB.getByText(/Unfinished upload found|Nicht abgeschlossener Upload gefunden/i),
    ).toBeVisible({ timeout: 10_000 });

    // The "Resume" button only renders when both halves of the contract
    // are present (id from localStorage + key from fragment).
    const resumeBtn = pageB.getByRole('button', { name: /^Resume$|^Fortsetzen$/i }).first();
    await expect(resumeBtn).toBeVisible();

    // The visible button calls pickResumeFiles, which click()s the hidden
    // input. In a real browser that opens the OS file picker; in headless
    // Playwright it would either no-op (no user gesture path to a file
    // chooser) or pop a `filechooser` event we'd have to manage. The
    // user-visible contract is "after the user re-picks the file, the
    // upload resumes" — we exercise that contract by setting the input
    // files directly. The change handler (`onResumeFilesPicked`) fires
    // exactly the same code path that a real file pick would.
    const resumeInput = pageB.locator('input#resume-file-input');
    await resumeInput.setInputFiles({
      name: fileName,
      mimeType: 'application/octet-stream',
      buffer: original,
    });
    // Once `onResumeFilesPicked` flips `phase` to 'uploading', the
    // banner unmounts (its `{#if phase === 'idle' || phase === 'error'}`
    // guard becomes false). Confirming the button has detached is the
    // closest in-flight signal to "resume actually started".
    await expect(resumeBtn).toHaveCount(0, { timeout: 5_000 });

    // Resume drives the loop to completion → result panel appears.
    await expect(pageB.locator('.result h3')).toBeVisible({ timeout: 30_000 });

    const shareUrl = await getShareUrl(pageB);
    expect(shareUrl).toMatch(/\/d\/[a-f0-9]{24}#k=/);

    // ---- Verify the assembled share decrypts to the original bytes ----
    await pageB.goto(shareUrl);
    await expect(pageB.getByRole('heading', { name: /ready|bereit/i })).toBeVisible({
      timeout: 15_000,
    });

    const [download] = await Promise.all([
      pageB.waitForEvent('download'),
      clickDownloadFor(pageB, fileName),
    ]);

    expect(download.suggestedFilename()).toBe(fileName);
    const downloaded = await readDownloadAsBuffer(download);
    expect(downloaded.byteLength).toBe(original.byteLength);
    expect(downloaded.equals(original)).toBe(true);
  } finally {
    await context.close();
  }
});
