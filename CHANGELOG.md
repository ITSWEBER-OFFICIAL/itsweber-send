# Changelog

All notable changes to ITSWEBER Send are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.0] - 2026-05-03

### Added

- S3 multipart-based resumable uploads: `S3Storage.appendStream` no longer throws on chunked input — each blob now maps to one S3 multipart upload. The adapter creates the multipart on the first chunk, uses `PartNumber = chunkIndex + 1` for every subsequent `UploadPart`, and commits via the new `finalizeAppend` interface method during the share's finalize handler. After a process restart mid-upload the adapter transparently recovers the open `UploadId` from S3 (`ListMultipartUploads` filtered by the full key) and rejoins the in-progress upload from the next chunk. `S3Storage.delete` aborts every open multipart under the share prefix in addition to deleting committed objects, so cancellation never leaks billable in-flight parts. Boot-time validation refuses `STORAGE_BACKEND=s3` with `CHUNK_SIZE_BYTES < 5 MiB` (S3 multipart minimum part size) and warns when `MAX_BLOB_BYTES > 10 000 × CHUNK_SIZE_BYTES` (S3 max parts ceiling).
- Streaming ZIP download for multi-file shares: when the recipient's browser supports the File System Access API (`showSaveFilePicker`), the "Alle als ZIP herunterladen" button streams every file through a `client-zip` encoder directly into a writable on disk — no in-memory ZIP buffer, no 2× file-size RAM peak. Each blob is fetched and decrypted chunk-by-chunk; an auth-tag failure aborts the writable so partial mis-authenticated plaintext is never delivered. The button is hidden on browsers without the API (Safari, Firefox) with an explanatory note; per-file downloads stay available everywhere. The server-side download counter increments exactly once per ZIP, matching `docs/V1.1_DECISIONS.md` §6.
- Resumable, chunked uploads (`/api/v1/uploads/*`) so files of arbitrary size — well past the previous 500 MB single-shot ceiling — can be uploaded without buffering the full plaintext or ciphertext on either side. The browser splits each file into 16 MiB chunks (configurable via `CHUNK_SIZE_BYTES`) and PATCHes one chunk at a time; the server appends each chunk to disk via `fs.createWriteStream`. The legacy `/api/v1/upload` route stays for v1.0 client compatibility.
- Manifest format v2: chunked AES-256-GCM with a unique random IV per chunk, written into the encrypted manifest. v1 manifests stay decryptable. Spec: [`packages/crypto-spec/README.md`](packages/crypto-spec/README.md).
- `StorageAdapter` stream extension (`appendStream`, `getStream`, `size`); the filesystem adapter implements true streaming append + Range read; the S3 adapter ships range-aware streaming downloads (the multipart-based resumable adapter for S3 is tracked for the next iteration).
- Range-aware blob download path: `/api/v1/download/:id/blob/:n` now returns a streamed body, supports HTTP `Range` requests, and emits `Accept-Ranges: bytes`.
- Pause / resume for uploads in the upload UI — backed by the resumable driver and persisted state.
- 2FA recovery codes: 10 single-use codes per user, hashed with Argon2id, shown exactly once with copy + download-as-TXT actions. Login accepts a recovery code as an alternative to a TOTP code; a successful or failed recovery-code attempt is recorded in the audit log.
- New configuration knobs: `CHUNK_SIZE_BYTES` (default 16 MiB), `MAX_BLOB_BYTES` (default 100 GB), `UPLOAD_RESUME_HOURS` (default 24).
- New table `uploads_in_progress` for resumable upload state; cleanup job reaps expired pending uploads.
- New table `mfa_recovery_codes`; SQLite `PRAGMA foreign_keys = ON` is now enabled at boot.
- Documentation: [`docs/V1.1_DECISIONS.md`](docs/V1.1_DECISIONS.md) (architecture rationale), [`docs/LARGE_FILES.md`](docs/LARGE_FILES.md) (per-layer ceilings for >5 GB uploads).

### Changed

- `docker/Caddyfile.example` and `docker/Caddyfile.lan` raise `request_body { max_size }` from 5 GB to 64 GB.
- `shares.manifest_version` column added; existing rows default to `1`. New shares from the resumable path declare `2`.
- `apps/api` test runner restricted to `--dir src` so compiled `build/` tests are no longer collected twice.

### Notes

The S3 backend now supports resumable chunked uploads via S3 multipart and is tested against MinIO. Per-blob ceiling on S3 is `10 000 × CHUNK_SIZE_BYTES` (≈156 GB at the default 16 MiB chunk size); raise `CHUNK_SIZE_BYTES` for larger files on S3, or use the filesystem backend which has no part-count cap.

## [1.0.0] - 2026-05-02

### Added

- Complete account management UI with nine sub-pages: uploads, API tokens, profile, security, notifications, locale, theme, quota and audit log
- Complete admin panel with five sub-pages: users, shares, audit log, system health and settings
- Four-word handoff code receive: the `/r` route resolves a four-word code to the share ID and redirects to the download page
- Two-factor authentication (TOTP/RFC 6238): setup, activation and login flow with a six-digit code step; implemented without external dependencies using `node:crypto`
- API token management: create named tokens with an optional expiry date, copy-once reveal, list and revoke
- Full internal documentation site at `/docs` with sub-pages for Security, API reference, Installation and Configuration; no external links
- Audit log stored per-user and accessible system-wide for admins

- M7 — S3/MinIO storage and webhooks
  - Pluggable storage adapter: `STORAGE_BACKEND=s3` uses `@aws-sdk/client-s3` for blob storage
  - Webhook delivery (`upload.created`, `download.completed`) with optional HMAC-SHA256 request signing
  - `docker-compose.full.yml` with a MinIO sidecar for local S3 testing

- M6 — Release preparation
  - Full documentation suite: `docs/INSTALL.md`, `docs/CONFIG.md`, `docs/API.md`, `docs/SECURITY.md`, `docs/ARCHITECTURE.md`
  - OpenAPI 3.0 specification served at `/api/v1/openapi.json` via `@fastify/swagger`; interactive Swagger UI at `/api/v1/docs` in development mode
  - `.github/FUNDING.yml`
  - `docs/TROUBLESHOOTING.md` updated with M2 and M5 lessons learned

- M5 — Hardening and Docker
  - Strict Content-Security-Policy on every Fastify response (mirrors the SvelteKit-side policy)
  - Cross-Origin-Opener-Policy `same-origin`, Cross-Origin-Embedder-Policy `credentialless`, Cross-Origin-Resource-Policy `same-origin`, Origin-Agent-Cluster
  - Strict-Transport-Security with two-year `max-age`, `includeSubDomains` and `preload`
  - Permissions-Policy denying every powerful browser feature the app does not use (camera, microphone, geolocation, payment, USB, MIDI, sensors, etc.)
  - Referrer-Policy `no-referrer`, X-Frame-Options `DENY`, X-Content-Type-Options `nosniff`, X-Permitted-Cross-Domain-Policies `none`
  - Caddyfile (`Caddyfile.example` and `Caddyfile.lan`) reapplies the same header set as a defense-in-depth layer
  - Login brute-force protection: 5 attempts per minute per IP, subsequent requests return 429
  - Registration throttle: 3 accounts per IP per 10 minutes
  - Upload throttle: 20 uploads per IP per hour
  - Health and readiness probes opt out of rate limiting
  - Dockerfile: healthcheck via Node's built-in `http` module (no `wget` in runtime image)
  - OCI image labels for title, description, source and license
  - `docker-compose.yml` and `docker-compose.lan.yml`: read-only rootfs, `cap_drop: ALL`, `no-new-privileges`, 64 MiB tmpfs for `/tmp`

- M4 — Account management and admin panel
  - Optional user accounts with email + password authentication
  - Argon2id password hashing (OWASP 2026 defaults: 64 MB memory, 3 iterations, parallelism 4)
  - 32-byte session tokens stored as `HttpOnly`, `Secure`, `SameSite=Strict` cookies
  - First user to register automatically receives the `admin` role
  - Upload history endpoint: `GET /api/v1/account/uploads` with per-user quota tracking
  - Account upload deletion: `DELETE /api/v1/account/uploads/:id`
  - Admin stats endpoint: `GET /api/v1/admin/stats`
  - Admin user-list endpoint: `GET /api/v1/admin/users` with limit/offset pagination
  - Quota enforcement on upload: authenticated users are blocked at their quota ceiling
  - `ENABLE_ACCOUNTS` and `REGISTRATION_ENABLED` environment variables

- M3 — Frontend polish
  - Drag-and-drop multi-file upload with automatic client-side ZIP streaming
  - Resumable chunked uploads via the tus.io protocol
  - Per-file and overall upload progress with ETA
  - Pause and resume controls for in-progress uploads
  - QR code for the share link, generated entirely client-side
  - Four-word handoff code as an alternative to the raw URL
  - Optional Markdown note for the recipient
  - Dark / light / system-preference theme toggle persisted in `localStorage`
  - German and English i18n, synchronously bundled (no async race condition)
  - PWA manifest — the app is installable from the browser
  - Mobile-optimised layout

- M2 — End-to-end-encrypted upload and download core
  - Web Crypto API wrapper: AES-256-GCM encryption, PBKDF2 200 000-iteration key derivation, password-based key wrapping
  - Filesystem storage adapter with expiry-based cleanup
  - better-sqlite3 share lifecycle database (creation, download counter, expiry tracking)
  - Multipart upload route: encrypts manifest + blobs, stores opaque ciphertext only
  - Download routes: manifest endpoint and per-blob streaming with download-limit enforcement
  - Hourly cleanup job for expired shares (storage + database)
  - 27 unit tests covering crypto round-trip, storage and health
  - Production runtime: SvelteKit's adapter-node handler mounted as Fastify's `setNotFoundHandler`
  - LAN test setup: `docker/Caddyfile.lan` and `docker/docker-compose.lan.yml`
  - `docs/TROUBLESHOOTING.md` with build, runtime and TLS pitfalls

- M1 — Initial monorepo skeleton
  - pnpm workspaces, Turborepo, TypeScript baseline
  - `packages/theme` with primitive tokens, light/dark presets and semantic CSS variables
  - `packages/shared` with shared types and Zod validators
  - `packages/crypto-spec` with the file-format and key-derivation specification
  - `apps/web` SvelteKit skeleton with theme store, BrandMark component and icon library
  - `apps/api` Fastify backend with `/health`, `/ready`, and API route scaffolding
  - `docker/Dockerfile` (multi-stage, non-root, alpine)
  - GitHub Actions CI: lint, typecheck, test, build, Trivy scan
  - Brand assets: Paper Plane Crypt logo as standalone SVG
  - Release validation script with allowlist enforcement

### Changed

- svelte-i18n bundles are imported synchronously instead of registered as lazy loaders, eliminating a first-render race condition
- SSR disabled globally (`ssr = false` in the root `+layout.ts`) so rendering and decryption state stay in the browser
- Pre-paint theme-apply script moved from inline `<script>` to `static/theme-init.js` to comply with the strict default CSP

### Fixed

- Reverse-proxy `X-Forwarded-For` was carrying `ip:port` (Caddy's `{remote}` placeholder), causing the rate limiter to treat each connection as a new client. Switched to `{remote_host}` so per-IP rate limits fire correctly.
- Synchronous i18n bundle loading resolves a first-render flash where the locale was not yet resolved.
- `default_sni` set in `Caddyfile.lan` so IP-literal HTTPS connections succeed during LAN testing.

[1.0.0]: https://github.com/itsweber/itsweber-send/releases/tag/v1.0.0
