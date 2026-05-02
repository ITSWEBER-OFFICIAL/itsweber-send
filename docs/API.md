# API Reference

All API endpoints live under the `/api/v1/` prefix. The machine-readable OpenAPI 3.0 spec is served at `/api/v1/openapi.json`.

**Authentication** uses a session cookie (`sid`) set by the login and register endpoints. For endpoints that require authentication, include the cookie in every request. The cookie is `HttpOnly`, `SameSite=Strict` and `Secure` in production.

**Content-Type** for POST/PATCH bodies is `application/json` unless otherwise noted.

**Error format** — all 4xx/5xx responses return a JSON body:

```json
{ "error": "Human-readable description" }
```

---

## System

### GET /health

Returns the server's operational status. Not rate-limited.

**Response 200**

```json
{
  "status": "ok",
  "uptimeMs": 123456,
  "version": "1.0.0"
}
```

---

### GET /ready

Returns 200 when the database is reachable, 503 otherwise. Intended for container readiness probes. Not rate-limited.

**Response 200**

```json
{ "ready": true }
```

**Response 503**

```json
{ "ready": false, "error": "Database not available" }
```

---

## Shares

### POST /api/v1/upload

Upload one or more files as a new encrypted share.

**Rate limit:** 20 requests per IP per hour.

**Content-Type:** `multipart/form-data`

All file blobs and the manifest must be encrypted client-side (AES-256-GCM) before upload. The server stores only ciphertext and the share metadata needed to serve it back.

**Parts**

| Name           | Type         | Required           | Description                                                              |
| -------------- | ------------ | ------------------ | ------------------------------------------------------------------------ |
| `meta`         | field (JSON) | Yes                | Share metadata. See schema below.                                        |
| `manifest-iv`  | field        | Yes                | Base64url-encoded 12-byte IV for the manifest ciphertext.                |
| `manifest`     | file         | Yes                | Encrypted manifest blob (AES-256-GCM ciphertext).                        |
| `blob-NNNN`    | file         | Yes, once per file | Encrypted file ciphertext, zero-padded 4-digit index starting at `0001`. |
| `blob-NNNN-iv` | field        | Yes, once per file | Base64url-encoded 12-byte IV for the corresponding blob.                 |

**`meta` JSON schema**

```json
{
  "fileCount": 2,
  "totalSizeEncrypted": 1048576,
  "expiryHours": 24,
  "downloadLimit": 5,
  "passwordProtected": false,
  "salt": null,
  "ivWrap": null,
  "wrappedKey": null
}
```

For password-protected shares, `passwordProtected` must be `true` and `salt`, `ivWrap`, `wrappedKey` must all be non-null base64url strings.

**Response 201**

```json
{
  "id": "a3f1b8c2d4e56789ab01cd23",
  "expiresAt": "2026-05-03T18:00:00.000Z"
}
```

**Response 400** — missing or invalid parts / meta validation failure
**Response 413** — authenticated user quota exceeded

---

### GET /api/v1/download/:id/manifest

Retrieve share metadata and the encrypted manifest for a share.

**Path parameters**

| Name | Description                                       |
| ---- | ------------------------------------------------- |
| `id` | Share identifier returned by the upload endpoint. |

**Response 200**

```json
{
  "id": "a3f1b8c2d4e56789ab01cd23",
  "createdAt": "2026-05-02T18:00:00.000Z",
  "expiresAt": "2026-05-03T18:00:00.000Z",
  "passwordRequired": false,
  "remainingDownloads": 4,
  "manifestCiphertext": "<base64url>",
  "manifestIv": "<base64url>",
  "salt": null,
  "ivWrap": null,
  "wrappedKey": null
}
```

`remainingDownloads` is `null` when there is no download limit.

For password-protected shares, `passwordRequired` is `true` and `salt` / `ivWrap` / `wrappedKey` contain the key-wrapping material needed by the client to derive the master key from the user's password.

**Response 404** — share not found
**Response 410** — share expired or download limit reached

---

### GET /api/v1/download/:id/blob/:n

Stream the nth encrypted blob for a share. `n` is 1-based. Each call to this endpoint on the last blob of a share increments the download counter; when the limit is reached subsequent calls return 410.

**Path parameters**

| Name | Description                  |
| ---- | ---------------------------- |
| `id` | Share identifier.            |
| `n`  | Blob index, starting at `1`. |

**Response 200** — `Content-Type: application/octet-stream`, body is the raw AES-GCM ciphertext.

**Response 400** — invalid blob index
**Response 404** — share or blob not found
**Response 410** — share expired or download limit reached

---

## Authentication

Authentication endpoints are only available when `ENABLE_ACCOUNTS=true`.

### POST /api/v1/auth/register

Register a new account. The first registration creates the admin account.

**Rate limit:** 3 requests per IP per 10 minutes.

**Body**

```json
{
  "email": "user@example.com",
  "password": "minimum8characters"
}
```

**Response 201** — sets `sid` session cookie

```json
{
  "id": "b2c3d4e5f6a7b8c9d0e1f2a3",
  "email": "user@example.com",
  "role": "user"
}
```

**Response 400** — validation error
**Response 404** — accounts disabled
**Response 409** — email already registered

---

### POST /api/v1/auth/login

Log in with an existing account.

**Rate limit:** 5 requests per IP per minute.

**Body**

```json
{
  "email": "user@example.com",
  "password": "yourpassword"
}
```

**Response 200** — sets `sid` session cookie

```json
{
  "id": "b2c3d4e5f6a7b8c9d0e1f2a3",
  "email": "user@example.com",
  "role": "user"
}
```

**Response 400** — validation error
**Response 401** — invalid credentials
**Response 404** — accounts disabled

---

### POST /api/v1/auth/logout

Invalidate the current session. Requires authentication.

**Response 200**

```json
{ "ok": true }
```

**Response 401** — not authenticated

---

### GET /api/v1/auth/me

Return the currently authenticated user.

**Response 200**

```json
{
  "id": "b2c3d4e5f6a7b8c9d0e1f2a3",
  "email": "user@example.com",
  "role": "user",
  "quotaBytes": 5368709120
}
```

**Response 401** — not authenticated

---

## Account

### GET /api/v1/account/uploads

List all shares created by the authenticated user, plus quota usage. Requires authentication.

**Response 200**

```json
{
  "uploads": [
    {
      "id": "a3f1b8c2d4e56789ab01cd23",
      "createdAt": "2026-05-02T18:00:00.000Z",
      "expiresAt": "2026-05-03T18:00:00.000Z",
      "expired": false,
      "downloadLimit": 5,
      "downloadsUsed": 1,
      "totalSizeBytes": 1048576,
      "passwordProtected": false
    }
  ],
  "quota": {
    "totalBytes": 5368709120,
    "usedBytes": 1048576,
    "remainingBytes": 5367660544
  }
}
```

**Response 401** — not authenticated

---

### DELETE /api/v1/account/uploads/:id

Delete a share created by the authenticated user. Removes both the database record and the stored blobs.

**Path parameters**

| Name | Description       |
| ---- | ----------------- |
| `id` | Share identifier. |

**Response 200**

```json
{ "ok": true }
```

**Response 401** — not authenticated
**Response 404** — share not found or does not belong to the authenticated user

---

## Admin

Admin endpoints require the authenticated user to have the `admin` role.

### GET /api/v1/admin/stats

Return aggregate storage and usage statistics.

**Response 200**

```json
{
  "shareCount": 42,
  "totalSizeBytes": 104857600,
  "userCount": 5
}
```

**Response 401** — not authenticated
**Response 403** — not an admin

---

### GET /api/v1/admin/users

List all registered users. Supports simple pagination.

**Query parameters**

| Name     | Default | Description                                       |
| -------- | ------- | ------------------------------------------------- |
| `limit`  | `50`    | Maximum number of users to return. Capped at 200. |
| `offset` | `0`     | Number of users to skip.                          |

**Response 200**

```json
[
  {
    "id": "b2c3d4e5f6a7b8c9d0e1f2a3",
    "email": "admin@example.com",
    "role": "admin",
    "createdAt": "2026-05-02T10:00:00.000Z",
    "lastLoginAt": "2026-05-02T18:00:00.000Z",
    "quotaBytes": 5368709120
  }
]
```

**Response 401** — not authenticated
**Response 403** — not an admin

---

## OpenAPI spec

The full OpenAPI 3.0 specification is served at:

```
GET /api/v1/openapi.json
```

An interactive Swagger UI is available at `/api/v1/docs` in development mode (`NODE_ENV=development`).
