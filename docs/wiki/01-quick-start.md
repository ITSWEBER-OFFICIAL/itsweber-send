# Quick Start

> [Deutsch](de/01-schnellstart.md)

## Docker (one-liner)

```bash
docker run -d \
  --name itsweber-send \
  --restart unless-stopped \
  -p 3000:3000 \
  -v send-data:/data \
  -e NODE_ENV=production \
  -e BASE_URL=http://localhost:3000 \
  --security-opt no-new-privileges:true \
  --read-only --tmpfs /tmp:size=64M \
  ghcr.io/itsweber/itsweber-send:latest
```

Open [http://localhost:3000](http://localhost:3000).

> Web Crypto requires a secure context. Plain `http://` works on `localhost`, but on any other hostname or IP you need HTTPS. See [02-docker-installation.md](02-docker-installation.md) for the Caddy + TLS setup.

## docker-compose

```yaml
services:
  itsweber-send:
    image: ghcr.io/itsweber/itsweber-send:latest
    container_name: itsweber-send
    restart: unless-stopped
    ports:
      - '3000:3000'
    volumes:
      - send-data:/data
    environment:
      NODE_ENV: production
      BASE_URL: http://localhost:3000
    security_opt:
      - no-new-privileges:true
    read_only: true
    tmpfs:
      - /tmp:size=64M

volumes:
  send-data:
```

## First steps

1. Open the web UI — drop one or more files into the upload zone
2. Set an expiry, a download limit, and (optionally) a password
3. Hit **Verschlüsseln & hochladen** — the browser encrypts client-side with AES-256-GCM
4. Share either the long link (with `#k=…`), the four-word code, or the QR code
5. The recipient opens the link — files are decrypted in their browser

## Optional account

Click **Konto** in the navigation and register. The first registered user automatically becomes admin and gets the admin panel under `/admin`. Accounts unlock:

- Upload history with per-user quota tracking
- API tokens for programmatic uploads
- Two-factor authentication (TOTP)
- Audit log of all actions on your account

See [11-account-and-2fa.md](11-account-and-2fa.md).

## Configuration

Set environment variables to change behaviour. The minimum for production:

| Variable          | Required | Description                    |
| ----------------- | -------- | ------------------------------ |
| `BASE_URL`        | yes      | Public URL of the service      |
| `NODE_ENV`        | yes      | Set to `production`            |
| `STORAGE_BACKEND` | no       | `filesystem` (default) or `s3` |
| `ENABLE_ACCOUNTS` | no       | `true` (default) or `false`    |

Full reference in the in-app docs at `/docs/config` or in [docs/CONFIG.md](../CONFIG.md).
