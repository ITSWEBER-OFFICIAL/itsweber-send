/**
 * Password-protected /d/<id> without a `#k=` fragment must render the
 * password-entry UI, not crash and not eagerly attempt to decrypt with
 * a missing key.
 *
 * The bug we're guarding against: the upload page intentionally builds
 * a fragment-less link for password-protected shares (the password is
 * the second factor — embedding the master key would defeat it). If the
 * download route eagerly evaluated `decryptWithFragmentKey` regardless,
 * the missing key would either throw inside the Svelte renderer or push
 * the page into the generic error phase, breaking the documented voice-
 * mode flow where the recipient enters the password by hand.
 */

import { expect, test } from '@playwright/test';
import { getShareUrl, makeFixture, setUploadFile } from './fixtures.js';

test('password-protected share without #k renders the password UI', async ({ page }) => {
  const fileName = 'password-share.bin';
  const original = makeFixture(64 * 1024, 0xb01dface); // 64 KiB — single-chunk fast path

  await page.goto('/');
  await setUploadFile(page, fileName, original);
  await expect(page.getByText(fileName, { exact: false })).toBeVisible();

  // Toggle password protection on. The label flips between locales so
  // we match either via role + name regex.
  const pwSwitch = page.getByRole('switch', {
    name: /Enable password protection|Passwortschutz aktivieren/i,
  });
  await pwSwitch.click();

  // The password input appears once the toggle flips on.
  const pwInput = page.getByPlaceholder(/Enter password|Passwort eingeben/i).first();
  await pwInput.fill('correct horse battery staple');

  await page.getByRole('button', { name: /Encrypt|Verschlüsseln/i }).click();

  await expect(page.locator('.result h3')).toBeVisible({ timeout: 30_000 });

  const shareUrl = await getShareUrl(page);
  // Password-protected shares MUST NOT carry a fragment — the UI relies on
  // this exact shape.
  expect(shareUrl).toMatch(/\/d\/[a-f0-9]{24}$/);
  expect(shareUrl).not.toContain('#');

  // Hop to the recipient page. Without a #k fragment we should see the
  // password-entry card, not an error and not a crash.
  await page.goto(shareUrl);

  // The lock-card heading is "Password required" / "Passwort erforderlich".
  await expect(
    page.getByRole('heading', { name: /Password required|Passwort erforderlich/i }),
  ).toBeVisible({ timeout: 10_000 });

  // The form input is wired up and ready for the password — confirms
  // the renderer didn't trip into an error or silent-blank state.
  const recipientPwInput = page.locator('input.password-input');
  await expect(recipientPwInput).toBeVisible();

  // The "no_key" generic error MUST NOT have shown — that path is for
  // non-password shares missing their fragment, not for this one.
  await expect(page.getByText(/Decryption failed/i)).toHaveCount(0);

  // Sanity: enter the password and confirm decryption proceeds (the
  // ready card appears). This double-checks that the password path is
  // not blocked by stale state from the missing fragment.
  await recipientPwInput.fill('correct horse battery staple');
  await page.getByRole('button', { name: /Decrypt|Entschlüsseln/i }).click();

  await expect(page.getByRole('heading', { name: /ready|bereit/i })).toBeVisible({
    timeout: 15_000,
  });
});
