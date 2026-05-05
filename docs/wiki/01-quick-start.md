# Quick Start

> [Deutsch](de/01-schnellstart.md)

The image ships in three deployment modes. Pick the one that matches your environment, then come back here for the post-install walkthrough.

## Mode 1 — LAN direct (embedded Caddy, self-signed TLS)

For a home lab on a static LAN IP, with no public domain.

```bash
docker run -d \
  --name itsweber-send \
  --restart unless-stopped \
  -p 8443:8443 \
  -v send-data:/data \
  -e SEND_HOST=192.168.1.100 \
  -e ORIGIN=https://192.168.1.100:8443 \
  -e BASE_URL=https://192.168.1.100:8443 \
  --security-opt no-new-privileges:true \
  --read-only --tmpfs /tmp:size=64m,mode=1777 \
  --cap-drop=ALL \
  ghcr.io/itsweber-official/itsweber-send:latest
```

Open `https://192.168.1.100:8443` and accept the self-signed certificate once.

## Mode 2 — Behind your existing reverse proxy

For setups where Nginx Proxy Manager, Traefik, an external Caddy or a vanilla Nginx already terminates HTTPS with a real certificate. The embedded Caddy is disabled so there is no double TLS termination.

```bash
docker run -d \
  --name itsweber-send \
  --restart unless-stopped \
  -p 3000:3000 \
  -v send-data:/data \
  -e REVERSE_PROXY_MODE=true \
  -e ORIGIN=https://send.example.com \
  -e BASE_URL=https://send.example.com \
  --security-opt no-new-privileges:true \
  --read-only --tmpfs /tmp:size=64m,mode=1777 \
  --cap-drop=ALL \
  ghcr.io/itsweber-official/itsweber-send:latest
```

Forward your public hostname to port `3000` over plain HTTP. Detailed reverse-proxy snippets: [`docs/REVERSE_PROXY.md`](https://github.com/ITSWEBER-OFFICIAL/itsweber-send/blob/main/docs/REVERSE_PROXY.md).

## Mode 3 — Public with bundled Caddy + Let's Encrypt

For single-server deployments with ports `80` / `443` free and no other proxy in front. See [02-docker-installation.md](02-docker-installation.md) for the Compose file with the bundled Caddy container.

## docker-compose (Mode 2 example)

```yaml
services:
  itsweber-send:
    image: ghcr.io/itsweber-official/itsweber-send:latest
    container_name: itsweber-send
    restart: unless-stopped
    ports:
      - '3000:3000'
    volumes:
      - send-data:/data
    environment:
      REVERSE_PROXY_MODE: 'true'
      ORIGIN: https://send.example.com
      BASE_URL: https://send.example.com
    security_opt:
      - no-new-privileges:true
    read_only: true
    tmpfs:
      - /tmp:size=64m,mode=1777
    cap_drop:
      - ALL

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
- Two-factor authentication (TOTP) with QR-code-scannable setup
- Audit log of all actions on your account

See [11-account-and-2fa.md](11-account-and-2fa.md).

## Configuration

The minimum for production:

| Variable             | Required | Description                                                                        |
| -------------------- | -------- | ---------------------------------------------------------------------------------- |
| `REVERSE_PROXY_MODE` | no       | `true` skips embedded Caddy and binds Node on `0.0.0.0:3000` for an external proxy |
| `ORIGIN`             | yes      | Public URL the service is reachable under (used in share links and cookie scope)   |
| `BASE_URL`           | yes      | Same as `ORIGIN` (used by the SvelteKit frontend)                                  |
| `SEND_HOST`          | mode 1   | LAN IP or hostname embedded into the embedded Caddy's self-signed cert             |
| `STORAGE_BACKEND`    | no       | `filesystem` (default) or `s3`                                                     |
| `ENABLE_ACCOUNTS`    | no       | `true` (default) or `false`                                                        |

Full reference in [docs/CONFIG.md](https://github.com/ITSWEBER-OFFICIAL/itsweber-send/blob/main/docs/CONFIG.md).
