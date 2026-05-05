# Changelog

All notable changes to ITSWEBER Send are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.3.5] - 2026-05-05

### Changed

- Unraid Docker template polished for Community Apps Store submission. The XML now carries a self-referencing `TemplateURL` so CA can refresh the entry on its own, a `Date` field, a `Changes` history block that the CA UI surfaces as "What's New", and a `Beta` flag set to `false`. The Overview leads with the actual product description rather than the deployment-mode list, so the CA browse preview is informative.
- README, status lines and CHANGELOG tag-link table aligned with the current public release set. Pre-public versions (v1.0.0, v1.1.0) keep their changelog entries as historical milestones but no longer link to non-existent GitHub Releases.

## [1.3.4] - 2026-05-05

### Changed

- Release pipeline temporarily builds only `linux/amd64`. The `linux/arm64` leg via QEMU emulation on the shared GitHub runners has been timing out at 45+ minutes per build, repeatedly hitting the auto-cancel ceiling. Will be re-enabled once GitHub provides native arm64 runners on the free tier or once a self-hosted arm64 builder is wired in. Existing arm64 images for previous tags remain untouched on GHCR.

## [1.3.3] - 2026-05-05

### Added

- Hamburger drawer for the account / admin sub-navigation on phone-sized viewports. The horizontally-scrolling icon strip used at `≤880 px` is replaced by a single button that shows the current section name and, on tap, slides in a full-width drawer with the grouped vertical sidebar (text labels, group headings, 44 px tap targets). Closes on link tap, overlay tap, the close button, or Escape.

### Changed

- Unraid template overview and the README's Unraid section now document the post-apply cleanup step (`rm /boot/config/plugins/dockerMan/templates-user/itsweber-send.xml`). Without that, Unraid can fall back to the bundled source template on Update / Force Update and overwrite the operator's customisations (network, IP, public domain, port mapping). Mitigation goes away once the project is in Community Apps proper.

## [1.3.2] - 2026-05-05

### Fixed

- 2FA setup and login were unusable: the TOTP code input had `pattern="[0-9]{6}"` which Svelte's template parser interpreted as a JavaScript expression — the `{6}` was evaluated to the integer `6`, producing the rendered HTML `pattern="[0-9]6"`. Browsers compiled that as a regex requiring "any digit followed by a literal 6", so a valid 6-digit TOTP like `535268` was rejected with "Eingabe muss mit dem geforderten Format übereinstimmen". Fixed in both `account/security` (enabling 2FA) and `login` (signing in with 2FA enabled) by switching to a JS string expression: `pattern={'[0-9]{6}'}`.
- Mobile layout on the account dashboard, admin dashboard and quota page: the stats grids stayed at 2 columns even on phone-sized viewports, causing the second column of cards to extend past the right edge. Now collapses to a single column at `≤480 px` (account / admin) and `≤420 px` (quota).
- Long descendants on account / admin pages (share IDs, OTP URIs, emails) were preventing the layout grid item from shrinking below their intrinsic width, occasionally causing page-level horizontal scroll. The content area now sets `min-width: 0` so the grid actually respects narrow viewports.

## [1.3.1] - 2026-05-05

### Added

- QR code in the 2FA setup flow: scan straight from the screen into Aegis / Google Authenticator / Bitwarden / 1Password instead of typing the 32-character secret. The `otpauth://` URI and the manual secret stay available as fallbacks.
- Unraid Docker template at [`unraid/itsweber-send.xml`](unraid/itsweber-send.xml). Drop it onto the Unraid USB at `/boot/config/plugins/dockerMan/templates-user/` and the container appears in the _Docker → Add Container → Template_ dropdown with all fields pre-filled (image, volume, env vars, security flags). Description includes the required pre-chown step.
- Startup preflight check in the entrypoint: when `/data` is not writable by the runtime user (UID 10001), the container now prints an actionable error message (`chown -R 10001:10001 /your/host/path`) before exiting, instead of crashing with the cryptic `SQLITE_CANTOPEN`.

### Fixed

- Mobile responsive issues: the appbar's wordmark wrapped to two lines on narrow phones (≤480 px). The wordmark is now hidden at that breakpoint, leaving the brand mark plus tightened auth links and language/theme tools. The page tree gains an `overflow-x: clip` safety net so a single overflowing descendant (long share URL, OTP URI) cannot make the whole page swipe sideways.

## [1.3.0] - 2026-05-05

### Added

- `REVERSE_PROXY_MODE=true` environment variable: skips the embedded Caddy and binds Node directly on `0.0.0.0:3000` so the container can sit behind an existing reverse proxy (NPM, Traefik, external Caddy, Nginx, an Ingress controller, …) without a second TLS layer in the way.
- `docker/docker-compose.proxy.yml`: ready-made single-container compose file for "I already run a reverse proxy" deployments.
- `docs/REVERSE_PROXY.md`: complete reverse-proxy configuration guide with copy-paste snippets for Nginx Proxy Manager, Traefik, external Caddy and vanilla Nginx.
- README quickstart now presents three deployment modes side by side (LAN direct, behind reverse proxy, public with bundled Caddy + Let's Encrypt).
- Container `EXPOSE` now lists both `8443` (all-in-one mode) and `3000` (reverse-proxy mode).

### Fixed

- `docker/docker-compose.yml` was unreachable in v1.2.0: the `send` service exposed port 3000 but Node listened only on `127.0.0.1:3000` because the embedded Caddy expected to be the only reverse proxy. The compose now sets `REVERSE_PROXY_MODE=true` so the upstream Caddy container can actually reach the send container on the shared network.
- `/health` endpoint reported a stale hardcoded version (`1.2.0-rc2`) regardless of the actual build. The version is now read from `apps/api/package.json` at runtime so it always tracks the deployed code.

## [1.2.0] - 2026-05-04

### Added

- All-in-one Docker image with embedded Caddy: a single `docker run` with `BASE_URL=https://…` now handles TLS termination, security headers and reverse-proxying internally — no separate Caddy container or Caddyfile required. The existing `docker-compose.yml` + external Caddy setup remains fully supported.
- SMTP mailer for optional on-first-download notification: when a share is created with the notification toggle enabled, the API sends an email to the uploader's address the first time a recipient downloads the share. SMTP is configured via `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` environment variables and can be tested via the new admin button.
- SMTP runtime settings and test-mail button in the admin panel: SMTP credentials can be updated without a container restart and verified immediately with a test delivery to the admin's address.
- FSA streaming for single-file downloads: browsers with the File System Access API now stream single files directly to disk in the same way multi-file ZIP streaming works, bypassing the in-memory buffer entirely.
- Per-file progress bar during FSA streaming: each file in a multi-file ZIP download shows its own progress indicator during the streaming decryption pass.
- Cross-session upload resume: a resumable upload started in one browser session (or on one device) can be continued from another by entering the original share link or the four-word code. The upload driver re-derives the encryption key from the URL fragment and resumes from the last committed chunk.
- Visible build version in the app footer and in the page title meta tag.
- Playwright E2E test step wired into the CI workflow; the test report is uploaded as an artifact on each run.

### Fixed

- 5+ GB upload and download path: an off-by-one in the chunk-range calculation caused the last chunk of a >5 GB upload to be written twice, corrupting the ciphertext and making the download fail with an auth-tag error. Fixed by clamping the byte-range to the actual file size.
- Doubly-encoded UTF-8 in German and English locale JSON files: a prior save through a non-UTF-8-aware editor introduced `\uXXXX` sequences for characters that are valid UTF-8 literals (`ä`, `ö`, `ü`, `–`, `…`). All locale files are now stored as plain UTF-8.

### Tests

- Regression suite for the v1.2 release-blocker fixes: covers the >5 GB chunk-boundary edge case (synthetic 5 GiB + 1 byte upload via mocked `appendStream`), the cross-session resume handshake, and the locale round-trip (JSON parse → i18n → rendered text).

## [1.1.0] - 2026-05-03

### Tests

- Playwright end-to-end suite (`apps/web/e2e/`) covering the three v1.1 critical paths: anonymous round-trip (upload → fragment-key download → byte-level match), voice-mode (password + wordcode reconstruct the share without a key in the URL), and resumable pause / resume on a multi-chunk upload throttled via Playwright's `route()` interception so the in-flight UI state is reliably observable. Both API and SvelteKit dev servers are spawned by `playwright.config.ts` against an isolated tmp DB and storage root, so the suite never touches developer state.

### UX

- Mobile UX audit (Block H, [`docs/MOBILE_UX_AUDIT.md`](docs/MOBILE_UX_AUDIT.md)). Per-file action buttons in the upload list bumped from 28 px to 36 px (default) / 44 px (mobile) to clear the WCAG 2.5.5 touch target. Expiry / download-limit chips get `min-height: 44px` on mobile. Global text-input rule sets `font-size: 16px` on `≤ 640 px` viewports so iOS Safari no longer zooms when the password / receive-code field is focused. `body` now uses `min-height: 100dvh` alongside `100vh` so the gradient background fills the actually-visible viewport on iOS Chrome and Safari. The sticky `.appbar` honors `env(safe-area-inset-*)` on both desktop and `≤ 880 px` breakpoints, fixing brand-mark overlap on devices with a notch / display cutout.

### Security

- Fix expired-row filtering in seven SQL queries (sessions, API tokens, share quota, in-progress uploads, admin stats). Rows store `expires_at` as ISO-8601 with `T`/`Z` (e.g. `2026-05-03T12:00:00.000Z`); SQLite's `datetime('now')` returns the canonical `YYYY-MM-DD HH:MM:SS` format. The previous lexical comparison `expires_at > datetime('now')` was always true (`'T'` (0x54) > `' '` (0x20)), so server-side expiry filtering was inert: expired sessions kept authenticating, expired API tokens kept being accepted, the admin "active shares" / "total storage" stats counted long-expired shares. Both sides of the comparison are now wrapped in `datetime(...)` so the canonicalised values compare correctly.

### Added

- Runtime-effective admin settings: the four values exposed by the admin UI (`registration_enabled`, `default_quota_bytes`, `max_upload_size_bytes`, `max_expiry_hours`) are now read on every request rather than at boot. New `apps/api/src/runtime-settings.ts` resolves each value as `db_setting ?? env_default`, so a fresh container starts with the env value and an admin change applies on the next request without a restart. Wired into `POST /api/v1/auth/register` (kill-switch + new-user quota) and `POST /api/v1/uploads` (per-file size cap + max expiry hours). `MAX_BLOB_BYTES` env stays the non-overridable hard ceiling: an admin can lower the effective per-file cap at runtime but cannot raise it past the env value. Changing `max_upload_size_bytes` at runtime applies to NEW uploads only — in-progress uploads finish under the value that was in effect at create time. `.env.example` and `docs/CONFIG.md` document the env / runtime relationship.
- Auth-hardening tests covering Bearer-token storage (sha256-only, never plaintext), expired-token rejection, deleted-token rejection, deleted-user cascade through `FOREIGN KEY ON DELETE CASCADE` (sessions and api_tokens), cookie-session validity, and `last_used_at` updates on each Bearer call. Tests exercise the real session middleware via injected Fastify requests.
- Cleanup-job storage-orphan reconciliation: a periodic pass enumerates every share-id present in storage and removes any that have no matching DB row and are not currently a pending upload's reserved slot. Mitigates the leftover state that a crashed `delete()` (DB row gone, storage write failed) or a manual DB intervention can leave behind. Implemented for both filesystem (`readdir`) and S3 (`ListObjectsV2` with `Delimiter='/'`).
- New `StorageAdapter.listShareIds()` interface method backing the orphan reconciliation; new DB helpers `getAllShareIdSet` and `getAllPendingUploadShareIdSet`; `runCleanupOnce` returns a structured outcome for tests.
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

<!--
  Tag-link table: only versions that have an associated GitHub Release on
  the current repository point at a real URL. Pre-public versions (v1.0.0,
  v1.1.0) live in this changelog as historical milestones but never had a
  GitHub Release of their own — the project went public with v1.2.0.
-->

[1.3.5]: https://github.com/ITSWEBER-OFFICIAL/itsweber-send/releases/tag/v1.3.5
[1.3.4]: https://github.com/ITSWEBER-OFFICIAL/itsweber-send/releases/tag/v1.3.4
[1.3.3]: https://github.com/ITSWEBER-OFFICIAL/itsweber-send/releases/tag/v1.3.3
[1.3.2]: https://github.com/ITSWEBER-OFFICIAL/itsweber-send/releases/tag/v1.3.2
[1.3.1]: https://github.com/ITSWEBER-OFFICIAL/itsweber-send/releases/tag/v1.3.1
[1.3.0]: https://github.com/ITSWEBER-OFFICIAL/itsweber-send/releases/tag/v1.3.0
[1.2.0]: https://github.com/ITSWEBER-OFFICIAL/itsweber-send/releases/tag/v1.2.0
