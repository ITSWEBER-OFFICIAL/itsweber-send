# Security

This document describes the security architecture of ITSWEBER Send. For reporting vulnerabilities, see [`.github/SECURITY.md`](../.github/SECURITY.md).

---

## Threat model

ITSWEBER Send is designed for the following threat landscape:

- **Trusted browser, untrusted server.** A compromised server (or a malicious hosting provider) cannot read file contents or filenames. The server stores only ciphertext. The encryption key lives exclusively in the URL fragment, which browsers do not send to the server.
- **Passive network observer.** Transport-layer security (HTTPS enforced by Caddy + HSTS) prevents a passive observer from reading traffic. Strict header policies prevent resource leakage via third-party requests.
- **Brute-force and enumeration attacks.** Rate limiting on login (5 / min / IP), registration (3 / 10 min / IP) and uploads (20 / hour / IP) limits automated abuse. Share IDs are 96-bit random values, making enumeration impractical.
- **Cross-site scripting.** A strict Content-Security-Policy restricts script execution to same-origin resources only. No third-party scripts or CDN resources are loaded.

**Out of scope:** An attacker who already holds the share URL (the URL fragment included) can decrypt the share — that is by design. The link is the capability.

---

## Cryptographic design

The full cryptographic specification lives in [`packages/crypto-spec/README.md`](../packages/crypto-spec/README.md). A summary:

### Primitives

| Primitive                 | Parameters                                                       |
| ------------------------- | ---------------------------------------------------------------- |
| Symmetric cipher          | AES-256-GCM (256-bit key, 96-bit IV, 128-bit auth tag)           |
| Key derivation (password) | PBKDF2-SHA-256, 200 000 iterations, 128-bit random salt          |
| Random source             | `crypto.getRandomValues` (browser) / `crypto.randomBytes` (Node) |
| Encoding                  | base64url (RFC 4648 §5)                                          |

### Encryption flow

1. The browser generates a 256-bit `master_key` with `crypto.getRandomValues`.
2. Each file blob is encrypted separately with AES-256-GCM using the `master_key` and a unique per-blob IV.
3. A manifest (containing encrypted filenames, sizes and MIME types) is encrypted with the same key.
4. All ciphertext is sent to the server. The `master_key` is never transmitted.
5. The share URL contains the `master_key` in the fragment: `https://host/d/<id>#k=<base64url-key>`. Fragments are not sent in HTTP requests and are not logged by servers or proxies.

### Optional password

When a password is set, the `master_key` is additionally wrapped:

```
salt       = random(16 bytes)
wrap_key   = PBKDF2(password, salt, 200_000 iterations, SHA-256) → 256 bits
wrapped_key = AES-GCM-encrypt(master_key, wrap_key, iv_wrap)
```

The server stores `salt`, `iv_wrap` and `wrapped_key`. To decrypt, the recipient must know both the URL (which contains `master_key` directly) or know the password (from which the `master_key` can be unwrapped). The server cannot bypass the password because it never has the plaintext password or the derived key.

### What the server knows

The server stores and can observe:

- Opaque blobs (ciphertext). Sizes and counts are visible.
- Share metadata: creation time, expiry, download limit, whether a password is set.
- For password-protected shares: the key-wrapping material (`salt`, `iv_wrap`, `wrapped_key`), but not the password itself.
- IP addresses in logs (subject to your log retention policy).

The server **cannot** observe: file contents, filenames, MIME types, or the master key.

---

## HTTP security headers

The following headers are set on every response by `@fastify/helmet` and enforced as a defense-in-depth layer by Caddy:

| Header                         | Value                                                                                                      |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| `Content-Security-Policy`      | `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; ...` |
| `Cross-Origin-Opener-Policy`   | `same-origin`                                                                                              |
| `Cross-Origin-Embedder-Policy` | `credentialless`                                                                                           |
| `Cross-Origin-Resource-Policy` | `same-origin`                                                                                              |
| `Strict-Transport-Security`    | `max-age=63072000; includeSubDomains; preload` (2 years)                                                   |
| `Referrer-Policy`              | `no-referrer`                                                                                              |
| `X-Content-Type-Options`       | `nosniff`                                                                                                  |
| `X-Frame-Options`              | `DENY`                                                                                                     |
| `Permissions-Policy`           | Denies all powerful features not used by the app                                                           |
| `Origin-Agent-Cluster`         | `?1`                                                                                                       |

The `Permissions-Policy` header explicitly disallows: camera, microphone, geolocation, payment, USB, MIDI, sensors, XR, display-capture, encrypted-media and all other powerful browser APIs that are not required for file transfer.

---

## Authentication

- Passwords are hashed with **Argon2id** (OWASP 2026 defaults: 64 MB memory, 3 iterations, parallelism 4).
- Session tokens are 32-byte cryptographically random values stored in an `HttpOnly`, `Secure`, `SameSite=Strict` cookie named `sid`.
- The first user to register receives the `admin` role.
- Login is rate-limited to 5 attempts per IP per minute. A constant-time hash is run even on non-existent accounts to prevent email enumeration via timing.
- Registration is rate-limited to 3 accounts per IP per 10 minutes.

---

## Container hardening

The production container (`docker/Dockerfile`) and the `docker-compose.yml` apply the following restrictions:

- Runs as UID 10001, never root.
- Read-only root filesystem (`read_only: true`); only `/tmp` is writable via a 64 MiB `tmpfs`.
- `cap_drop: ALL` — no Linux capabilities beyond what is inherited.
- `security_opt: no-new-privileges:true` — prevents privilege escalation via setuid binaries.
- Healthcheck is implemented in Node's built-in `http` module; no extra binaries like `wget` or `curl` are present in the runtime image.
- OCI image labels include source repository and license.

---

## Dependency scanning

The GitHub Actions CI pipeline runs [Trivy](https://trivy.dev/) against the container image on every push to `main`. HIGH and CRITICAL findings are reported; the pipeline will block releases when unfixed vulnerabilities are present.

---

## Responsible disclosure

See [`.github/SECURITY.md`](../.github/SECURITY.md) for the vulnerability reporting process.
