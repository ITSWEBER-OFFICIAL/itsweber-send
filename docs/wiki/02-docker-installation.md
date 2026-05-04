# Docker Installation

> [Deutsch](de/02-docker-installation.md)

## Prerequisites

- Docker 24+ or Docker Desktop 4.x
- Docker Compose 2.20+
- A public hostname pointing at the server (for production with TLS)
- Ports 80 and 443 free on the host (for Caddy)

---

## Production with Caddy + TLS

### 1. Download the Compose file

```bash
curl -O https://raw.githubusercontent.com/itsweber/itsweber-send/main/docker/docker-compose.yml
curl -O https://raw.githubusercontent.com/itsweber/itsweber-send/main/docker/Caddyfile.example
```

### 2. Set the hostname

Edit `Caddyfile.example`, replace `send.example.com` with your domain. Save it as `Caddyfile`.

### 3. Start

```bash
BASE_URL=https://send.example.com docker compose up -d
```

Caddy fetches a Let's Encrypt certificate on first start. After about 30 seconds the service is reachable at `https://send.example.com`.

### What runs

| Container             | Image                                   | Purpose                                  |
| --------------------- | --------------------------------------- | ---------------------------------------- |
| `itsweber-send`       | `ghcr.io/itsweber/itsweber-send:latest` | Application (API + SSR frontend)         |
| `itsweber-send-caddy` | `caddy:2-alpine`                        | TLS reverse proxy, security-header layer |

The application listens on `:3000` inside the network and is **not** exposed publicly. Only Caddy binds host ports `:80` and `:443`.

---

## LAN / home-lab (self-signed TLS)

For testing on a local network without a public domain:

```bash
docker compose -f docker/docker-compose.lan.yml up -d
```

Caddy uses `tls internal` to issue a self-signed certificate. Browsers show a warning on first visit — add an exception once.

The LAN compose binds `:8443` on the host (instead of `:443`) so it can coexist with other services. Connect via `https://<host-ip>:8443`.

---

## Persistent data

By default a Docker named volume `send-data` holds:

```
send-data/
  shares.db        # SQLite database (better-sqlite3)
  uploads/         # encrypted blob storage
```

To use a host directory instead, mount it:

```yaml
volumes:
  - /srv/itsweber-send:/data
```

Make sure the host directory is writable by UID 10001 (the container's `app` user).

---

## Updating

```bash
docker compose pull
docker compose up -d
```

Database migrations are applied automatically on container start. No manual SQL is required between patch and minor releases.

---

## Backup

The volume contains the entire state. Stop the container, copy the volume, restart:

```bash
docker compose stop itsweber-send
docker run --rm -v send-data:/data -v $PWD:/backup alpine \
  tar czf /backup/send-backup-$(date +%F).tar.gz /data
docker compose start itsweber-send
```

For S3 storage, only `shares.db` is in the volume — blobs live in the bucket and need a separate backup strategy.

---

## Building from source

```bash
git clone https://github.com/ITSWEBER-OFFICIAL/itsweber-send
cd itsweber-send
pnpm install
docker build -f docker/Dockerfile -t itsweber-send:dev .
```
