# Troubleshooting

> [Deutsch](de/90-fehlerbehebung.md)

## Web Crypto unavailable / errors during encryption

Web Crypto requires a **secure context**. Browsers count `https://` and `http://localhost` as secure, but **not** `http://192.168.x.x` or any other plain-HTTP IP/hostname. Symptoms: encryption silently fails, the result panel never appears, console shows `TypeError: window.crypto.subtle is undefined`.

Fix: serve the app over HTTPS. The bundled LAN compose (`docker-compose.lan.yml`) does this with self-signed certs out of the box. See [02-docker-installation.md](02-docker-installation.md).

---

## "Kein Schlüssel im Link" on a download URL

The URL the recipient opened has no `#k=…` fragment. Either:

- The link was copied incorrectly (some chat clients strip URL fragments — try paste-and-edit)
- The recipient was sent only a four-word code without a password (the code resolves the share ID but cannot decrypt — see [10-sharing-flow.md](10-sharing-flow.md))

For voice-only sharing, the sender must set a password on the share. With code + password, the recipient unlocks via the password prompt.

---

## "Kein Share mit diesem Wort-Code gefunden"

The four-word code did not resolve to any share. Causes:

- Typo — codes are case-insensitive but every word must be spelled exactly
- The share has expired or was deleted
- The frontend and backend word-list have drifted (this should not happen on a clean v1.0+ deployment)

If you are running a self-built image, verify both `apps/api/src/utils/wordcode.ts` and `apps/web/src/lib/share/wordcode.ts` have identical 255-entry arrays.

---

## Login rate-limited unexpectedly

The login endpoint allows 5 attempts per IP per minute, the registration endpoint 3 per IP per 10 minutes. Behind a reverse proxy that does not forward client IPs correctly, every request looks like the same client and rate limits trigger immediately.

Fix: ensure the proxy passes `X-Forwarded-For` with the **client IP only**, not `ip:port`. Caddy's `{remote_host}` placeholder works correctly; the older `{remote}` variant carries `ip:port` and breaks rate limiting.

---

## Container starts but `/health` returns 503

`/ready` returns 503 when the SQLite probe query fails. Causes:

- Volume not writable by UID 10001 — `chown 10001:10001` the host directory
- Read-only rootfs without writable `/data` or `/tmp` — re-add the `tmpfs` mount
- Disk full

`docker logs itsweber-send` shows the underlying SQLite error.

---

## Pre-built image fails on Unraid with `--frozen-lockfile`

Only relevant when building locally. Run `pnpm install` to regenerate the lockfile, then rebuild:

```bash
pnpm install
docker build -f docker/Dockerfile -t itsweber-send:dev .
```

---

## TLS certificate not issued by Caddy

Caddy needs ports 80 and 443 reachable from the public internet to complete the ACME challenge. Behind another reverse proxy, use the LAN compose (which uses `tls internal`) or terminate TLS at the upstream proxy and run ITSWEBER Send without Caddy.

---

## 2FA codes always reject

The TOTP implementation accepts a ±1 step (±30 s) clock-skew window. Beyond that, codes fail. Check:

- The host clock is synchronized (`timedatectl status` on Linux, Settings -> Time on Unraid)
- The authenticator's device clock is correct
- The Base32 secret was scanned without trailing whitespace

If a user is locked out and the clock fix does not help, an admin can clear `users.totp_enabled = 0` via SQLite. See [11-account-and-2fa.md](11-account-and-2fa.md).

---

## Upload progress stalls at 100 % but never finishes

The browser sent all bytes; the server is now writing the blob to storage. For large files on slow disks (or S3 with high latency) this can take several seconds. If it stalls beyond ~60 s, check:

- `docker logs itsweber-send` for storage errors
- Disk space and write permissions on `/data`
- For S3: that the bucket exists and the credentials are valid

---

## More

The in-app `/docs` site has up-to-date FAQ entries, and the source-tree `docs/TROUBLESHOOTING.md` records lessons from past milestones.
