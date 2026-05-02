# Architecture

## Overview

ITSWEBER Send is a single-process Node.js application that serves both the REST API (Fastify) and the SvelteKit web frontend from port 3000. In production, a Caddy reverse proxy sits in front for automatic TLS.

```
Browser
  |
  | HTTPS
  v
Caddy (TLS termination, security headers, compression)
  |
  | HTTP (internal Docker network)
  v
Node.js process (port 3000)
  ├── Fastify (API routes: /health, /api/v1/*)
  └── SvelteKit handler (all other paths via setNotFoundHandler)
        |
        ├── SQLite (better-sqlite3, ./data/shares.db)
        └── Filesystem storage (./data/uploads/)
```

Everything runs in a single Docker container. No separate database service or cache is required.

---

## Monorepo layout

```
itsweber-send/
├── apps/
│   ├── api/          — Fastify backend
│   └── web/          — SvelteKit frontend
├── packages/
│   ├── theme/        — Design tokens (3-layer: primitive → semantic → component)
│   ├── shared/       — Zod schemas, shared TypeScript types
│   └── crypto-spec/  — Cryptographic format specification
├── docker/           — Dockerfile, docker-compose files, Caddyfiles
├── docs/             — Documentation
├── brand/            — Logo SVGs, usage guidelines
└── scripts/          — Release validation, dev utilities
```

The workspace is managed with pnpm workspaces and Turborepo.

---

## Request lifecycle

### Upload

```
Browser
  1. User selects files
  2. Web Crypto: generate master_key, encrypt each file blob + manifest (AES-256-GCM)
  3. POST /api/v1/upload  (multipart: meta JSON, manifest IV, manifest blob, blob-NNNN, blob-NNNN-iv)
  4. Fastify validates meta with Zod schema
  5. Storage adapter writes blobs to disk
  6. SQLite: insert share record (expiry, download limit, password wrapping material)
  7. Reply: { id, expiresAt }
  8. Build share URL: https://host/d/<id>#k=<base64url-master-key>
```

The `master_key` never leaves the browser — it is placed only in the URL fragment.

### Download

```
Browser
  1. Parse URL fragment: extract master_key (or prompt for password)
  2. GET /api/v1/download/:id/manifest
  3. Fastify: verify share exists, not expired, not at download limit
  4. Reply: manifest ciphertext + IV, password wrapping material (if applicable)
  5. Browser decrypts manifest → file list
  6. For each blob: GET /api/v1/download/:id/blob/:n
  7. Browser decrypts each blob with master_key + per-blob IV
  8. Assemble files (single file or multi-file ZIP in the browser)
```

---

## Storage layer

The default storage adapter (`FilesystemStorage`) writes encrypted blobs to the directory configured by `STORAGE_PATH`. Each share gets a subdirectory named by its 24-hex-character ID:

```
<STORAGE_PATH>/
  <share-id>/
    manifest          — AES-GCM ciphertext
    manifest.iv       — 12-byte IV, base64url
    blob-0001         — AES-GCM ciphertext of file 1
    blob-0001.iv
    …
    meta.json         — unencrypted: expiry, download limit, password wrapping material
```

The storage adapter interface (`StorageAdapter`) is defined in `apps/api/src/storage/interface.ts` and is the only contract needed to implement alternative backends (S3, MinIO, etc.).

An hourly background job (`apps/api/src/jobs/cleanup.ts`) deletes shares past their expiry time from both the database and the filesystem.

---

## Database schema

SQLite via better-sqlite3. The database is single-file, in-process, and requires no separate service.

**shares**

| Column             | Type    | Notes                                                 |
| ------------------ | ------- | ----------------------------------------------------- |
| `id`               | TEXT PK | 24-character hex string (12 random bytes)             |
| `created_at`       | TEXT    | ISO 8601                                              |
| `expires_at`       | TEXT    | ISO 8601                                              |
| `download_limit`   | INTEGER | 0 = unlimited                                         |
| `downloads_used`   | INTEGER |                                                       |
| `salt`             | TEXT    | Base64url, present only for password-protected shares |
| `iv_wrap`          | TEXT    | Base64url, present only for password-protected shares |
| `wrapped_key`      | TEXT    | Base64url, present only for password-protected shares |
| `user_id`          | TEXT    | FK to users, NULL for anonymous uploads               |
| `total_size_bytes` | INTEGER | Total encrypted size                                  |

**users**

| Column          | Type        | Notes                    |
| --------------- | ----------- | ------------------------ |
| `id`            | TEXT PK     | 24-character hex string  |
| `email`         | TEXT UNIQUE | Stored lowercase         |
| `password_hash` | TEXT        | Argon2id PHC string      |
| `created_at`    | TEXT        | ISO 8601                 |
| `role`          | TEXT        | `user` or `admin`        |
| `quota_bytes`   | INTEGER     | Per-account upload limit |
| `last_login_at` | TEXT        | ISO 8601, nullable       |

**sessions**

| Column       | Type    | Notes                                     |
| ------------ | ------- | ----------------------------------------- |
| `id`         | TEXT PK | 64-character hex string (32 random bytes) |
| `user_id`    | TEXT    | FK to users                               |
| `created_at` | TEXT    | ISO 8601                                  |
| `expires_at` | TEXT    | ISO 8601                                  |

---

## Frontend

The SvelteKit frontend (`apps/web`) is built with `adapter-node` and served by the Fastify process via `setNotFoundHandler`. This allows the API and UI to share a single port and process without a second service.

In development, the SvelteKit dev server runs on `:5173` and proxies `/api/*` to the Fastify API on `:3000`.

Key frontend packages:

| Package          | Purpose                                         |
| ---------------- | ----------------------------------------------- |
| `svelte-i18n`    | German and English i18n, synchronously bundled  |
| `qrcode`         | Client-side QR code generation for share links  |
| `packages/theme` | Design tokens consumed as CSS custom properties |

---

## Security plugin stack

The following Fastify plugins are registered on every request (see `apps/api/src/plugins/core.ts`):

1. `@fastify/helmet` — HTTP security headers (CSP, COOP, COEP, HSTS, etc.)
2. `@fastify/cors` — CORS disabled in production, permissive in development
3. `@fastify/rate-limit` — Global per-IP rate limiting (60 req/min default)
4. `@fastify/cookie` — Cookie parsing required by the session middleware

Rate limits are tightened per-route for login (5 / min), registration (3 / 10 min) and upload (20 / hour).

---

## Container

The `docker/Dockerfile` is a two-stage build:

1. **Builder stage** (`node:22-alpine`): installs all dependencies, runs `pnpm deploy` to produce a self-contained API build and a SvelteKit adapter-node bundle.
2. **Runtime stage** (`node:22-alpine`): copies only the production artifacts. Native module build tools (`python3`, `g++`, `make`) are not present in the runtime image.

Runtime image runs as UID 10001 with a read-only root filesystem and no Linux capabilities beyond those inherited. `/tmp` is a 64 MiB tmpfs.

---

## Design tokens

The `packages/theme` package implements a three-layer token architecture:

```
Primitives  →  Semantic tokens  →  Component tokens
(raw values)   (role-based)        (element-specific)
```

Tokens are CSS custom properties consumed directly in SvelteKit components and Tailwind via `@theme`. No raw hex values appear in component files.

---

## Extensibility

### Storage backends

Implement `StorageAdapter` from `apps/api/src/storage/interface.ts`:

```typescript
interface StorageAdapter {
  put(shareId: string, name: string, data: Buffer): Promise<void>;
  get(shareId: string, name: string): Promise<Buffer>;
  delete(shareId: string): Promise<void>;
}
```

### Webhook events

Set `WEBHOOK_URL` to receive `upload.created` and `download.completed` events as HMAC-signed JSON POST requests. Set `WEBHOOK_SECRET` to enable `X-Webhook-Signature: sha256=<hex>` request signing. Delivery is fire-and-forget with a single retry.

### S3 / MinIO

Set `STORAGE_BACKEND=s3` and configure `S3_BUCKET`, `S3_ENDPOINT` (for MinIO), `S3_REGION`, `S3_FORCE_PATH_STYLE=true` (for MinIO), plus the standard `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY`. See `docker/docker-compose.full.yml` for a complete MinIO setup example.
