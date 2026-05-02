# API-Referenz

> [English](../20-api-reference.md)

Alle Endpunkte liegen unter `/api/v1/`. Die OpenAPI-3.0-Spec wird unter `/api/v1/openapi.json` ausgeliefert, eine interaktive Swagger-UI unter `/api/v1/docs`. Die vollständige In-App-Referenz lebt unter `/docs/api`.

Diese Seite ist eine Navigations-Übersicht. Schemata, Response-Codes und Content-Types stehen in der OpenAPI-Spec oder in den In-App-Docs.

---

## Authentifizierung

Zwei Methoden:

1. **Session-Cookie** (`sid`) — gesetzt von `POST /api/v1/auth/login` und `POST /api/v1/auth/register`. `HttpOnly`, `SameSite=Strict`, `Secure` in Produktion.
2. **API-Token** — `Authorization: Bearer <token>`. Erstellung unter `Konto -> API-Tokens`. Siehe [11-konto-und-2fa.md](11-konto-und-2fa.md).

---

## Endpunkt-Gruppen

### System (ohne Auth, ohne Rate-Limit)

- `GET /health` — Uptime, Version, Status
- `GET /ready` — 200 wenn DB erreichbar, 503 sonst

### Shares (anonym oder authentifiziert)

- `POST /api/v1/upload` — Multipart-Upload des verschlüsselten Manifests + Blobs (20/h/IP)
- `GET /api/v1/download/:id/manifest` — verschlüsseltes Manifest
- `GET /api/v1/download/:id/blob/:n` — einzelner verschlüsselter Blob (1-basiert)
- `GET /api/v1/r/:wordcode` — 4-Wort-Code zu Share-ID auflösen

### Authentifizierung (nur bei `ENABLE_ACCOUNTS=true`)

- `POST /api/v1/auth/register` (3 / 10 min / IP)
- `POST /api/v1/auth/login` (5 / min / IP, zweistufig mit `totpCode` bei aktivem 2FA)
- `POST /api/v1/auth/logout`
- `GET /api/v1/auth/me`

### Account (Auth erforderlich)

- `GET /api/v1/account/uploads` — eigene Shares + Quota
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

### Admin (Admin-Rolle erforderlich)

- `GET / PATCH / DELETE /api/v1/admin/users[/:id]`
- `GET / DELETE /api/v1/admin/shares[/:id]`
- `GET /api/v1/admin/audit`
- `GET /api/v1/admin/health`
- `GET / PATCH /api/v1/admin/settings`

---

## Beispiel: anonymer Upload

Der Upload-Endpunkt erwartet einen Multipart-Body mit verschlüsseltem Manifest und einem Ciphertext-Blob pro Datei. Verschlüsselung erfolgt **client-seitig**; der Server speichert opake Bytes.

Eine Referenz-Implementierung liegt in `apps/web/src/lib/upload/client.ts`. Aus dem Browser empfiehlt sich der Import dieses Moduls, statt Multipart-Formatierung selbst zu schreiben.

Roher `curl`-Aufruf mit existierendem Ciphertext (fortgeschritten):

```bash
curl -X POST https://send.example.com/api/v1/upload \
  -F 'meta={"fileCount":1,"totalSizeEncrypted":1234,"expiryHours":24,"downloadLimit":5,"passwordProtected":false,"salt":null,"ivWrap":null,"wrappedKey":null}' \
  -F 'manifest-iv=<base64url>' \
  -F 'manifest=@manifest.bin' \
  -F 'blob-0001-iv=<base64url>' \
  -F 'blob-0001=@blob1.bin'
```

Antwort:

```json
{
  "id": "a3f1b8c2d4e56789ab01cd23",
  "wordcode": "tasche-lampe-schnee-ofen",
  "expiresAt": "2026-05-03T18:00:00.000Z"
}
```

---

## Webhooks

Wenn `WEBHOOK_URL` gesetzt ist, postet der Server JSON für `upload.created` und `download.completed`. Mit `WEBHOOK_SECRET` enthält jeder Request den Header `X-Webhook-Signature: sha256=<hex>`. Zustellung ist Best-Effort mit einem Retry. Vollständiges Schema in [docs/CONFIG.md](../../CONFIG.md).
