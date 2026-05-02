# Changelog

All notable changes to ITSWEBER Send are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- M2 — End-to-end-encrypted upload and download core
  - Web Crypto API wrapper: AES-256-GCM, PBKDF2 200k iterations, password-based key wrapping
  - Filesystem storage adapter with expiry-based cleanup
  - better-sqlite3 share lifecycle database (creation, download counter, expiry tracking)
  - Multipart upload route: encrypts manifest + blobs, stores opaque ciphertext only
  - Download routes: manifest endpoint and per-blob streaming with download-limit enforcement
  - Hourly cleanup job for expired shares (storage + database)
  - Upload UI: drag-and-drop, password protection, expiry and download-limit settings
  - Download UI: client-side decryption, password prompt, progress feedback
  - 27 unit tests covering crypto round-trip, storage filesystem and health
- Production runtime: SvelteKit's adapter-node handler mounted as Fastify's `setNotFoundHandler` so API and web app share a single port and process
- LAN test setup: `docker/Caddyfile.lan` and `docker/docker-compose.lan.yml` for Unraid / home-lab testing with self-signed certificates (Web Crypto requires a secure context)
- `docs/TROUBLESHOOTING.md` with the build, runtime and TLS pitfalls hit during M2
- M1 — Initial monorepo skeleton: pnpm workspaces, Turborepo, TypeScript baseline
- `packages/theme` with primitive tokens, light/dark presets and semantic CSS variables
- `packages/shared` with shared types and validators (with a real `tsc` build step so `pnpm deploy` produces runnable JavaScript)
- `packages/crypto-spec` with the file-format and key-derivation specification
- `apps/web` SvelteKit skeleton with theme store, BrandMark, icon library and German/English i18n
- `apps/api` Fastify backend with `/health`, `/api/v1/upload`, `/api/v1/download/:id/manifest`, `/api/v1/download/:id/blob/:n`
- `docker/Dockerfile` (multi-stage, non-root, alpine) with native-module build tools and `pnpm deploy` for self-contained API output
- GitHub Actions workflow scaffolding (CI; release pipeline gated until M6)
- Brand assets: logo "Paper Plane Crypt" as standalone SVG with usage guidelines
- Release validation script that enforces an allowlist of repository paths

### Changed

- svelte-i18n bundles are imported synchronously instead of registered as lazy loaders, eliminating a first-render race condition
- SSR disabled globally (`ssr = false` in the root `+layout.ts`) so rendering and any decryption state stay in the browser
- Pre-paint theme-apply script moved from inline `<script>` to `static/theme-init.js` to comply with the strict default CSP (`script-src 'self'`)
