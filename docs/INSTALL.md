# Installation

## Requirements

| Dependency | Minimum version | Notes |
|---|---|---|
| Docker | 24 | For container-based deployment |
| Docker Compose | 2.20 | Comes bundled with Docker Desktop |
| Node.js | 22 LTS | Required for building from source |
| pnpm | 9 | Package manager for the monorepo |

A reverse proxy that handles TLS is strongly recommended in production. The bundled `docker-compose.yml` uses Caddy, which obtains a Let's Encrypt certificate automatically.

---

## Docker (recommended)

### 1. Download the Compose file

```bash
curl -O https://raw.githubusercontent.com/itsweber/itsweber-send/main/docker/docker-compose.yml
curl -O https://raw.githubusercontent.com/itsweber/itsweber-send/main/docker/Caddyfile.example
```

### 2. Set the public hostname

```bash
export BASE_URL=https://send.example.com
# Edit Caddyfile.example and replace `send.example.com` with your hostname.
```

### 3. Start

```bash
docker compose up -d
```

Caddy will obtain a certificate from Let's Encrypt on first start. The application is then reachable at `https://send.example.com`.

### Persistent data

By default, a Docker named volume `send-data` holds the SQLite database and uploaded blobs. All data survives container restarts and upgrades.

```
send-data/
  shares.db        — SQLite database
  uploads/         — encrypted blob storage
```

To back up, copy the entire volume or mount a host directory:

```yaml
volumes:
  - /path/on/host/send-data:/data
```

---

## LAN / home-lab setup

For testing on a local network without a public domain, use the LAN compose:

```bash
docker compose -f docker/docker-compose.lan.yml up -d
```

This uses Caddy with self-signed TLS. The browser will show a certificate warning on first visit — add an exception once. All Web Crypto operations require HTTPS; plain HTTP is not supported for upload or download pages.

See `docker/Caddyfile.lan` for the configuration details.

---

## Building from source

```bash
git clone https://github.com/itsweber/itsweber-send
cd itsweber-send

# Install dependencies
pnpm install

# Run in development mode (API on :3000, web UI on :5173)
pnpm dev
```

To build a production artifact:

```bash
pnpm build
```

To build and run the Docker image locally:

```bash
docker build -f docker/Dockerfile -t itsweber-send:local .
docker run -d --name itsweber-send -p 3000:3000 -v send-data:/data \
  -e NODE_ENV=production -e BASE_URL=http://localhost:3000 \
  itsweber-send:local
```

---

## Upgrading

When a new version is published:

```bash
docker compose pull
docker compose up -d
```

The application applies any pending database migrations on startup. No manual SQL steps are required between patch and minor releases. Review the [changelog](../CHANGELOG.md) before upgrading across major versions.

---

## Uninstalling

```bash
# Stop and remove containers
docker compose down

# Also remove all data (irreversible)
docker compose down -v
```
