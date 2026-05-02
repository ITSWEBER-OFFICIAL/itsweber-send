# API Reference

> [Deutsch](de/20-api-referenz.md)

All endpoints live under `/api/v1/`. The OpenAPI 3.0 spec is served at `/api/v1/openapi.json` and an interactive Swagger UI is at `/api/v1/docs`. The complete in-app API reference is at `/docs/api`.

This page is a navigational summary. For schemas, response codes and content types, see the OpenAPI spec or the in-app docs.

---

## Authentication

Two methods are supported:

1. **Session cookie** (`sid`) — set by `POST /api/v1/auth/login` and `POST /api/v1/auth/register`. `HttpOnly`, `SameSite=Strict`, `Secure` in production.
2. **API token** — pass `Authorization: Bearer <token>`. Created at `Konto -> API-Tokens`. See [11-account-and-2fa.md](11-account-and-2fa.md).

---

## Endpoint groups

### System (no auth, no rate limit)

- `GET /health` — uptime, version, status
- `GET /ready` — 200 if database is reachable, 503 otherwise

### Shares (anonymous or authenticated)

- `POST /api/v1/upload` — multipart upload of encrypted manifest + blobs (20/h/IP)
- `GET /api/v1/download/:id/manifest` — encrypted manifest
- `GET /api/v1/download/:id/blob/:n` — single encrypted blob (1-based index)
- `GET /api/v1/r/:wordcode` — resolve a four-word code to a share ID

### Authentication (only when `ENABLE_ACCOUNTS=true`)

- `POST /api/v1/auth/register` (3 / 10 min / IP)
- `POST /api/v1/auth/login` (5 / min / IP, two-step with `totpCode` if 2FA enabled)
- `POST /api/v1/auth/logout`
- `GET /api/v1/auth/me`

### Account (auth required)

- `GET /api/v1/account/uploads` — own shares + quota
- `DELETE /api/v1/account/uploads/:id`
- `GET / PATCH /api/v1/account/profile`
- `GET /api/v1/account/security`
- `POST /api/v1/account/security/password`
- `POST /api/v1/account/security/2fa/setup`
- `POST /api/v1/account/security/2fa/verify`
- `POST /api/v1/account/security/2fa/disable`
- `GET / PATCH /api/v1/account/notifications`
- `GET / POST /api/v1/account/tokens`
- `DELETE /api/v1/account/tokens/:id`
- `GET /api/v1/account/audit`

### Admin (admin role required)

- `GET / PATCH / DELETE /api/v1/admin/users[/:id]`
- `GET / DELETE /api/v1/admin/shares[/:id]`
- `GET /api/v1/admin/audit`
- `GET /api/v1/admin/health`
- `GET / PATCH /api/v1/admin/settings`

---

## Example: anonymous upload

The upload endpoint expects a multipart body with the encrypted manifest and one ciphertext blob per file. All encryption is **client-side**; the server stores opaque bytes.

A reference Node.js client lives in `apps/web/src/lib/upload/client.ts`. From the browser, the recommended path is to import that module rather than reimplement multipart formatting by hand.

For a raw `curl` example using existing ciphertext (advanced):

```bash
curl -X POST https://send.example.com/api/v1/upload \
  -F 'meta={"fileCount":1,"totalSizeEncrypted":1234,"expiryHours":24,"downloadLimit":5,"passwordProtected":false,"salt":null,"ivWrap":null,"wrappedKey":null}' \
  -F 'manifest-iv=<base64url>' \
  -F 'manifest=@manifest.bin' \
  -F 'blob-0001-iv=<base64url>' \
  -F 'blob-0001=@blob1.bin'
```

Response:

```json
{
  "id": "a3f1b8c2d4e56789ab01cd23",
  "wordcode": "tasche-lampe-schnee-ofen",
  "expiresAt": "2026-05-03T18:00:00.000Z"
}
```

---

## Webhooks

If `WEBHOOK_URL` is set, the server POSTs JSON for `upload.created` and `download.completed` events. With `WEBHOOK_SECRET` set, each request includes `X-Webhook-Signature: sha256=<hex>`. Delivery is best-effort with one retry. See [docs/CONFIG.md](../CONFIG.md) for the full schema.
