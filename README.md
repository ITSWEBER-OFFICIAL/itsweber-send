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
  <a href="#features">Features</a> ·
  <a href="#quickstart">Quickstart</a> ·
  <a href="#configuration">Configuration</a> ·
  <a href="docs/SECURITY.md">Security</a> ·
  <a href="docs/API.md">API</a> ·
  <a href="LICENSE">License</a>
</p>

---

> **Status:** v1.1.0 — adds resumable, chunked uploads for files of arbitrary size (well past the previous 500 MB ceiling), 2FA recovery codes, range-aware streaming downloads, and manifest format v2. v1.0 shares stay decryptable. GitHub push pending final sign-off.

## What it is

ITSWEBER Send is a modern, lightweight file-sharing service you run yourself. Files are encrypted in the browser (AES-256-GCM, key in URL fragment) before they touch the server — the server only ever sees ciphertext. Upload one or more files, get a link plus an optional QR code or four-word handoff phrase, and share it. After the configured number of downloads or expiry time, the share is permanently deleted.

Inspired by the original Firefox Send and the [timvisee/send](https://github.com/timvisee/send) fork, but rebuilt from scratch with a modern stack and a wider feature set.

## Features

### Sharing

- Drag-and-drop multi-file upload with resumable, chunked uploads — files of arbitrary size are streamed in 16 MiB ciphertext chunks, with pause / resume from the UI (v1.1)
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

---

## Screenshots

<!-- Screenshots will be added before the public GitHub release. -->
<!-- Brand assets and screenshots live in brand/screenshots/ -->

---

## Quickstart

### Run with Docker Compose (production)

```bash
# Download the Compose file and Caddyfile
curl -O https://raw.githubusercontent.com/itsweber/itsweber-send/main/docker/docker-compose.yml
curl -O https://raw.githubusercontent.com/itsweber/itsweber-send/main/docker/Caddyfile.example

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
  ghcr.io/itsweber/itsweber-send:latest
```

Open `http://localhost:3000` in your browser.

> Note: upload and download require a secure context. For local testing over HTTP, Web Crypto works in `localhost` specifically but not on an IP or arbitrary hostname. See [docs/INSTALL.md](docs/INSTALL.md) for the LAN setup with self-signed TLS.

### Run from source

```bash
git clone https://github.com/itsweber/itsweber-send
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
| [docs/MOBILE_UX_AUDIT.md](docs/MOBILE_UX_AUDIT.md)               | Mobile UX audit (touch targets, viewport, safe-area) |
| [docs/V1.1_DECISIONS.md](docs/V1.1_DECISIONS.md)                 | v1.1 architecture decisions                          |
| [docs/LARGE_FILES.md](docs/LARGE_FILES.md)                       | Per-layer ceilings for >5 GB uploads                 |
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
