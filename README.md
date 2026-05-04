<!-- markdownlint-disable MD033 MD041 -->
<p align="center">
  <svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 120 120" fill="#3ba7a7" aria-hidden="true">
    <mask id="m"><rect width="120" height="120" fill="#fff"/><path d="M 38 72 L 86 50 L 60 86 L 60 72 Z" fill="#000"/><path d="M 38 72 L 60 72 L 60 86 Z" fill="#000"/></mask>
    <path d="M 42 50 L 42 38 a 18 18 0 0 1 36 0 L 78 50" fill="none" stroke="#3ba7a7" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/>
    <rect x="26" y="50" width="68" height="56" rx="11" fill="#3ba7a7" mask="url(#m)"/>
  </svg>
</p>

<h1 align="center">ITSWEBER Send</h1>

<p align="center">
  <strong>Self-hosted, end-to-end encrypted file sharing in a single Docker container.</strong>
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-AGPL--3.0-3ba7a7.svg" alt="License: AGPL-3.0"></a>
  <a href="#quickstart"><img src="https://img.shields.io/badge/Docker-ready-2ea3f2.svg" alt="Docker ready"></a>
  <a href="https://itsweber.de"><img src="https://img.shields.io/badge/by-itsweber.de-2ea3f2.svg" alt="Made by ITSWEBER"></a>
</p>

<p align="center">
  <a href="#features">Features</a> ·
  <a href="#quickstart">Quickstart</a> ·
  <a href="#configuration">Configuration</a> ·
  <a href="docs/SECURITY.md">Security</a> ·
  <a href="docs/API.md">API</a> ·
  <a href="LICENSE">License</a>
</p>

<p align="center">
  🇩🇪 <strong>Auf Deutsch lesen</strong> → <a href="README.de.md">README.de.md</a>
</p>

---

> **Status:** v1.2.0 — resumable chunked uploads for files of any size, 2FA recovery codes, FSA streaming downloads, SMTP notifications, and an all-in-one container with embedded Caddy. All v1.0 shares stay decryptable.

---

## Screenshots

<details open>
<summary><strong>Upload</strong></summary>

![Upload page — dark theme with files queued and share settings](docs/previews/screenshots/01-upload-dark.png)
*Drag & drop multi-file upload with expiry, download limit, password protection, 4-word code and notification settings.*

![Upload page — password and settings configured](docs/previews/screenshots/02-upload-configured.png)
*All share options filled in: password, Markdown note for the recipient, notification on first download.*

</details>

<details>
<summary><strong>Share created</strong></summary>

![Share created — QR code, 4-word code, and share link](docs/previews/screenshots/03-share-created.png)
*Ready to share: voice-readable 4-word code, scannable QR code, and the full encrypted link — all generated client-side.*

</details>

<details>
<summary><strong>Receive & Download</strong></summary>

![Receive page — enter a share link or 4-word code](docs/previews/screenshots/04-receive.png)
*Recipients enter the share link, 24-character ID, or the 4-word handoff code to look up a share.*

![Download page — file list with per-file download buttons](docs/previews/screenshots/05-download.png)
*Files are listed with type and size. Download individually or grab all as a streaming ZIP. The server only ever sees ciphertext.*

</details>

<details>
<summary><strong>Admin panel</strong></summary>

![Admin dashboard — users, shares, and storage overview](docs/previews/screenshots/06-admin-overview.png)
*System overview: registered users, active and total shares, storage used. Links to health, readiness and OpenAPI endpoints.*

![Admin panel — SMTP mail template editor](docs/previews/screenshots/07-admin-mail-templates.png)
*Customise the on-first-download notification email with full HTML template editing and a live preview.*

</details>

---

## What it is

ITSWEBER Send is a modern, lightweight file-sharing service you run yourself. Files are encrypted in the browser (AES-256-GCM, key in URL fragment) before they touch the server — the server only ever sees ciphertext. Upload one or more files, get a link plus an optional QR code or four-word handoff phrase, and share it. After the configured number of downloads or expiry time, the share is permanently deleted.

Inspired by the original Firefox Send and the [timvisee/send](https://github.com/timvisee/send) fork, but rebuilt from scratch with a modern stack and a wider feature set.

## Features

### Sharing

- Drag-and-drop multi-file upload with resumable, chunked uploads — files of arbitrary size are streamed in 16 MiB ciphertext chunks, with pause / resume from the UI
- Per-share password (layered on top of the URL key — when set, the share is decrypted via password only, no master key in the link)
- Configurable expiry (1 h / 24 h / 7 d / 30 d) and download limit (1× to unlimited; counts per recipient share-download, not per blob)
- QR code generated client-side for the share link
- Four-word handoff code as an alternative to the long URL — combine with a password for fully voice-shareable transfers
- Optional Markdown note for the recipient

### Privacy & Security

- Client-side AES-256-GCM encryption — the server never receives plaintext or filenames
- Argon2id password hashing (OWASP 2026 defaults) for user accounts
- Strict CSP, COOP/COEP, HSTS, Permissions-Policy — no third-party requests
- Rate limiting and progressive backoff for brute-force attempts
- Container runs as non-root with a read-only root filesystem and dropped capabilities
- No telemetry, no trackers, no phone-home

### UX

- Light, dark and system-preference themes
- German and English UI (i18n-ready)
- Installable as a PWA
- Anonymous by default; optional account adds upload history, higher quota and API token management

### Operations

- Single container, no external database or cache service required
- SQLite by default
- Health and readiness endpoints for container orchestrators
- Webhooks for upload and download events
- S3 / MinIO storage backend
- SMTP notifications on first download

---

## Quickstart

### Run with Docker Compose (production)

```bash
# Download the Compose file and Caddyfile
curl -O https://raw.githubusercontent.com/ITSWEBER-OFFICIAL/itsweber-send/main/docker/docker-compose.yml
curl -O https://raw.githubusercontent.com/ITSWEBER-OFFICIAL/itsweber-send/main/docker/Caddyfile.example

# Set your hostname and start
BASE_URL=https://send.example.com docker compose up -d
```

Edit `Caddyfile.example` to replace `send.example.com` with your domain. Caddy obtains a Let's Encrypt certificate automatically.

### Run without a reverse proxy (local / quick test)

```bash
docker run -d \
  --name itsweber-send \
  -p 3000:3000 \
  -v send-data:/data \
  -e NODE_ENV=production \
  -e BASE_URL=http://localhost:3000 \
  ghcr.io/itsweber-official/itsweber-send:latest
```

Open `http://localhost:3000` in your browser.

> Note: upload and download require a secure context. For local testing over HTTP, Web Crypto works in `localhost` specifically but not on an IP or arbitrary hostname. See [docs/INSTALL.md](docs/INSTALL.md) for the LAN setup with self-signed TLS.

### Run from source

```bash
git clone https://github.com/ITSWEBER-OFFICIAL/itsweber-send
cd itsweber-send
pnpm install
pnpm dev
```

Web UI: `http://localhost:5173` — API: `http://localhost:3000`

---

## Configuration

All configuration is done via environment variables. Full reference: [docs/CONFIG.md](docs/CONFIG.md).

| Variable               | Default                 | Purpose                                        |
| ---------------------- | ----------------------- | ---------------------------------------------- |
| `BASE_URL`             | `http://localhost:3000` | Public URL the service is reachable under      |
| `NODE_ENV`             | `development`           | Set to `production` for production deployments |
| `STORAGE_BACKEND`      | `filesystem`            | `filesystem` (default) or `s3` for S3/MinIO    |
| `STORAGE_PATH`         | `./data/uploads`        | Filesystem-backend upload directory            |
| `DB_PATH`              | `./data/shares.db`      | SQLite database path                           |
| `RATE_LIMIT_PER_MIN`   | `60`                    | Per-IP request limit per minute                |
| `ENABLE_ACCOUNTS`      | `true`                  | Allow optional user accounts                   |
| `REGISTRATION_ENABLED` | `true`                  | Allow new registrations                        |
| `DEFAULT_QUOTA_BYTES`  | `5368709120`            | Per-user quota (default: 5 GB)                 |

---

## Documentation

| Document                                                         | Description                                          |
| ---------------------------------------------------------------- | ---------------------------------------------------- |
| [docs/INSTALL.md](docs/INSTALL.md)                               | Installation guide for Docker and from source        |
| [docs/CONFIG.md](docs/CONFIG.md)                                 | Full environment variable reference                  |
| [docs/API.md](docs/API.md)                                       | REST API reference                                   |
| [docs/SECURITY.md](docs/SECURITY.md)                             | Security architecture and threat model               |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)                     | System design and component overview                 |
| [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md)               | Known issues and build/runtime pitfalls              |
| [packages/crypto-spec/README.md](packages/crypto-spec/README.md) | Cryptographic format specification                   |
| [CHANGELOG.md](CHANGELOG.md)                                     | Release history                                      |

---

## Architecture

| Layer     | Choice                                   | Notes                                                     |
| --------- | ---------------------------------------- | --------------------------------------------------------- |
| Backend   | Fastify 5 on Node.js 22                  | Resumable chunked uploads (custom protocol), S3 multipart |
| Frontend  | SvelteKit 2 + Svelte 5 + Vite            | TailwindCSS v4, svelte-i18n                               |
| Crypto    | Web Crypto API                           | AES-256-GCM, PBKDF2 200 k iterations                      |
| DB        | better-sqlite3                           | Embedded; no separate service                             |
| Storage   | Filesystem (default) / S3 (MinIO) plugin | Pluggable adapter                                         |
| Container | node:22-alpine, multi-stage              | Non-root UID 10001, read-only rootfs                      |
| Proxy     | Caddy 2                                  | Automatic TLS, security headers                           |

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the full write-up.

---

## License

[AGPL-3.0-only](LICENSE). Running a modified version as a network service requires making the source of your modifications available to the users of that service.

## Contributing

Pull requests are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for the development setup and conventions. For security issues, use the private reporting process described in [`.github/SECURITY.md`](.github/SECURITY.md).
