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
  <a href="docs/IMPLEMENTATION_PLAN.md">Plan</a> ·
  <a href="docs/SECURITY.md">Security</a> ·
  <a href="LICENSE">License</a>
</p>

---

> **Status:** Pre-alpha. Active development. Not yet ready for production use.

## What it is

ITSWEBER Send is a modern, lightweight file-sharing service you run yourself. Files are encrypted in the browser (AES-256-GCM, key in URL fragment) before they touch the server — the server only ever sees ciphertext. You upload, get a link plus an optional QR code or four-word handoff phrase, and share it. After the configured number of downloads or expiry, the file is gone.

Inspired by the original Firefox Send and the [timvisee/send](https://github.com/timvisee/send) fork, but rebuilt from scratch with a modern stack and a wider feature set.

## Features

### Sharing

- Drag-and-drop multi-file upload, automatic ZIP-streaming
- Resumable, chunked uploads (tus.io protocol)
- Per-share password (in addition to the URL key)
- Configurable expiry (1 h / 24 h / 7 d / 30 d) and download limit (1× to ∞)
- QR code for the share link
- Four-word handoff code as an alternative to the long URL
- Optional Markdown note for the recipient

### Privacy & Security

- Client-side AES-256-GCM encryption; the server never sees plaintext
- Strict CSP, COOP/COEP, HSTS, no third-party requests
- Rate limiting and progressive backoff for brute-force attempts
- Container runs as non-root with a read-only root filesystem
- No telemetry, no trackers, no phone-home

### UX

- Light, dark and system-preference themes
- German and English UI (i18n-ready)
- Installable as a PWA, Web Share Target on mobile
- Anonymous by default; optional account adds upload history, higher quota and API tokens

### Operations

- Single container, target image size below 150 MB
- SQLite by default, optional Redis and S3/MinIO backends
- Health endpoint, optional Prometheus metrics
- Webhooks for upload and download events (v1.1)

## Quickstart

```bash
# Clone (after the public release)
git clone https://github.com/itsweber/itsweber-send
cd itsweber-send

# Install dependencies
pnpm install

# Run web + api in development
pnpm dev
```

The web UI will be on http://localhost:5173, the API on http://localhost:3000.

### Run the container (once published)

```bash
docker run -d \
  --name itsweber-send \
  -p 3000:3000 \
  -v send-data:/data \
  ghcr.io/itsweber/itsweber-send:latest
```

For a production setup including Caddy auto-HTTPS, see [`docker/docker-compose.yml`](docker/docker-compose.yml).

## Configuration

All configuration is done via environment variables. The full reference lives in [`docs/CONFIG.md`](docs/CONFIG.md). The most important ones:

| Variable | Default | Purpose |
| --- | --- | --- |
| `BASE_URL` | `http://localhost:3000` | Public URL the service is reachable under |
| `STORAGE_BACKEND` | `filesystem` | `filesystem` or `s3` |
| `STORAGE_PATH` | `/data/uploads` | Filesystem-backend upload directory |
| `MAX_FILE_SIZE_MB` | `5120` | Per-file upload limit |
| `MAX_EXPIRY_HOURS` | `720` | Maximum expiry users can pick |
| `RATE_LIMIT_PER_MIN` | `60` | Per-IP request rate limit |
| `ENABLE_ACCOUNTS` | `true` | Allow optional user accounts |

## Architecture

| Layer | Choice | Notes |
| --- | --- | --- |
| Backend | Fastify 5 on Node.js 22 | Multipart + tus-node-server for uploads |
| Frontend | SvelteKit 2 + Svelte 5 + Vite | TailwindCSS v4, svelte-i18n |
| Crypto | Web Crypto API | AES-256-GCM, PBKDF2 200 k iter |
| DB | better-sqlite3 | Embedded; no separate service needed |
| Storage | Filesystem (default) / S3 (plugin) | Pluggable adapter pattern |
| Container | node:22-alpine, multi-stage | Non-root, read-only rootfs |

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the longer write-up.

## Documentation

- [Implementation plan](docs/IMPLEMENTATION_PLAN.md) — full roadmap, decisions, milestones
- [HTML previews](docs/previews/index.html) — the visual reference for the UI
- [Crypto specification](packages/crypto-spec/README.md) — file format and key derivation

## License

[AGPL-3.0-only](LICENSE). If you run a modified version of this software as a network service, you must make the source of your modifications available to the users of that service.

## Contributing

Pull requests welcome once the project hits its first tagged release. See [CONTRIBUTING.md](CONTRIBUTING.md). For security reports, see [`.github/SECURITY.md`](.github/SECURITY.md).
