# Security Architecture

> [Deutsch](de/30-sicherheit.md)

Short version: the browser holds the key, the server holds opaque ciphertext. A full server compromise discloses sizes and timing — never plaintext, filenames, or MIME types.

For the complete cryptographic specification see [packages/crypto-spec/README.md](../../packages/crypto-spec/README.md).

---

## Threat model

| Threat | Mitigation |
| --- | --- |
| Compromised server / hosting provider | E2E encryption: server only stores ciphertext. Master key lives in URL fragment, never sent to server. |
| Passive network observer | TLS 1.3 via Caddy, HSTS with two-year `max-age` and `preload`. |
| Brute-force on accounts | Login: 5 / min / IP. Registration: 3 / 10 min / IP. Constant-time hash even on missing accounts. |
| Cross-site scripting | Strict CSP: only same-origin scripts, no third-party CDNs. `dangerouslySetInnerHTML` is forbidden. |
| Share-ID enumeration | 96-bit random IDs (`crypto.randomBytes(12)`). Probability of collision is negligible at any practical scale. |
| Password guessing on protected shares | Argon2id (accounts) and PBKDF2 200 000 iterations (share passwords). Both run on the device of whoever holds the password — server cannot brute-force. |

**Out of scope:** an attacker who already has the share URL (with `#k=…`) can decrypt the share. The link is the capability — that is by design.

---

## Cryptographic primitives

| Use | Primitive | Parameters |
| --- | --- | --- |
| File encryption | AES-256-GCM | 256-bit key, 96-bit IV, 128-bit auth tag |
| Manifest encryption | AES-256-GCM | Same key as file encryption, separate IV |
| Password key wrap | PBKDF2-SHA-256 | 200 000 iterations, 128-bit salt |
| Account passwords | Argon2id | OWASP 2026: 64 MB memory, t=3, p=4 |
| Random | Web Crypto / `node:crypto` | CSPRNG only |
| Encoding | base64url | RFC 4648 §5 |

---

## What the server sees vs. what it cannot

**Sees**

- Opaque blobs (ciphertext) — sizes are visible
- Share metadata: created-at, expiry, download limit, whether a password is set
- For password-protected shares: the wrapping material (`salt`, `iv_wrap`, `wrapped_key`) — never the password itself
- IP addresses subject to your log retention

**Cannot see**

- File contents
- Filenames
- MIME types
- The master key

---

## HTTP security headers

Set on every response by `@fastify/helmet` and re-applied by Caddy as a defense-in-depth layer:

- `Content-Security-Policy` — same-origin only, no inline scripts (the theme-init script lives in `static/theme-init.js`)
- `Cross-Origin-Opener-Policy: same-origin`
- `Cross-Origin-Embedder-Policy: credentialless`
- `Cross-Origin-Resource-Policy: same-origin`
- `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`
- `Referrer-Policy: no-referrer`
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `Permissions-Policy` denies camera, microphone, geolocation, payment, USB, MIDI, sensors, XR, display-capture, encrypted-media — every powerful API the app does not use

---

## Container hardening

The runtime image (`docker/Dockerfile`) and the bundled compose files apply:

- Runs as UID 10001, never root
- `read_only: true` rootfs; only `/tmp` is writable via a 64 MiB tmpfs
- `cap_drop: ALL` — no Linux capabilities
- `security_opt: no-new-privileges:true`
- Healthcheck implemented in Node's built-in `http` module — no `wget` or `curl` in the runtime image
- OCI image labels for source repository and license

---

## Dependency scanning

CI runs Trivy against the container image on every push to `main`. HIGH and CRITICAL findings block releases. PRs see Trivy results in the GitHub Actions summary.

---

## Reporting vulnerabilities

See [`.github/SECURITY.md`](../../.github/SECURITY.md) for the private disclosure process.
