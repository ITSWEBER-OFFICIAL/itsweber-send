/**
 * Voice-mode share: 4-word code + password are sufficient on their own.
 *
 * The sender enables a password and keeps the wordcode toggle on. The
 * receiver hits /r, pastes the wordcode, gets redirected to /d/<id>
 * without a key fragment, enters the password, and the manifest is
 * unwrapped via PBKDF2 — proving the upload is recoverable end-to-end
 * over a phone call (no link, no QR, no fragment key).
 */

import { expect, test } from '@playwright/test';
import {
  clickDownloadFor,
  getShareUrl,
  makeFixture,
  readDownloadAsBuffer,
  setUploadFile,
} from './fixtures.js';

test('voice-mode: wordcode + password reconstruct the share', async ({ page }) => {
  const fileName = 'voice.bin';
  const original = makeFixture(48 * 1024, 0x5eed01);
  const password = 'correct horse battery staple';

  await page.goto('/');
  await setUploadFile(page, fileName, original);

  // Enable password protection. The toggle is a role="switch" with the
  // localized aria-label "Enable password protection".
  await page.getByRole('switch', { name: /Enable password protection|Passwortschutz/i }).click();
  await page
    .getByPlaceholder(/Enter password|Passwort eingeben/i)
    .first()
    .fill(password);

  // Wordcode is on by default — no need to toggle.
  await page.getByRole('button', { name: /Encrypt|Verschlüsseln/i }).click();
  await expect(page.locator('.result h3')).toBeVisible({ timeout: 30_000 });

  // Voice-share box is rendered iff wordcode + password >= 4 chars are set.
  const voiceBox = page.locator('.voice-share');
  await expect(voiceBox).toBeVisible();

  const wordcode = (await voiceBox.locator('.field .val').first().textContent())?.trim();
  expect(wordcode).toMatch(/^[a-z]+-[a-z]+-[a-z]+-[a-z]+$/);

  // The visible share URL in voice mode points at /d/<id> WITHOUT a key
  // fragment — the password is the second factor.
  const voiceUrl = await getShareUrl(page);
  expect(voiceUrl).toMatch(/\/d\/[a-f0-9]{24}$/);

  // Receive flow: hit /r, paste the wordcode, follow the redirect.
  await page.goto('/r');
  await page.locator('input#code').fill(wordcode!);
  await page.getByRole('button', { name: /Öffnen|Open/i }).click();

  await expect(page).toHaveURL(/\/d\/[a-f0-9]{24}$/, { timeout: 10_000 });

  // Password gate appears because the URL has no #k= fragment.
  await expect(page.getByRole('heading', { name: /Password required|Passwort/i })).toBeVisible();
  await page.locator('input.password-input').fill(password);
  await page.getByRole('button', { name: /Decrypt|Entschlüsseln/i }).click();

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
