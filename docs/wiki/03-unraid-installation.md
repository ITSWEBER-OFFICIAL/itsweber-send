# Unraid Installation

> [Deutsch](de/03-unraid-installation.md)

## Manual Template

1. Go to **Docker** -> **Add Container**
2. Configure the fields below
3. Click **Apply**

| Field                   | Value                                                                     |
| ----------------------- | ------------------------------------------------------------------------- |
| Name                    | `itsweber-send`                                                           |
| Repository              | `ghcr.io/itsweber/itsweber-send:latest`                                   |
| Network type            | `Bridge`                                                                  |
| Restart policy          | `unless-stopped`                                                          |
| Port mapping            | `3000 -> 3000 (TCP)` (or whatever host port you prefer)                   |
| Volume mapping          | `/mnt/user/appdata/itsweber-send -> /data`                                |
| Environment: `NODE_ENV` | `production`                                                              |
| Environment: `BASE_URL` | `http://[UNRAID-IP]:3000` (or your reverse-proxy URL)                     |
| Extra parameters        | `--security-opt no-new-privileges:true --read-only --tmpfs /tmp:size=64M` |
| Privileged              | No                                                                        |

## With Caddy via the bundled compose

If you have a dedicated build directory on the array:

```
/mnt/user/appdata/itsweber-send-build/docker/
  docker-compose.lan.yml
  Caddyfile.lan
```

Then from the Unraid CLI:

```bash
cd /mnt/user/appdata/itsweber-send-build/docker
docker compose -f docker-compose.lan.yml up -d
```

Caddy listens on `:8443` with a self-signed TLS certificate. Connect from any device on the LAN via `https://<unraid-ip>:8443`.

## Behind an existing reverse proxy

If you already run **Nginx Proxy Manager**, **SWAG**, or **Traefik** on Unraid:

1. Run `itsweber-send` only (no separate Caddy). Map host port `3000:3000`.
2. Add a proxy host pointing `send.your-domain.tld` to `http://[UNRAID-IP]:3000`.
3. Set `BASE_URL=https://send.your-domain.tld` in the container's environment.
4. Make sure the proxy passes through `Host` and `X-Forwarded-Proto` headers.

For Nginx Proxy Manager specifically: enable **Block Common Exploits** off, **Websockets Support** on, and add this in the Advanced tab so the rate limiter sees the correct client IP:

```
proxy_set_header X-Real-IP $remote_addr;
proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
```

## Access

Direct: `http://[UNRAID-IP]:3000`  
With bundled LAN compose: `https://[UNRAID-IP]:8443`  
Behind reverse proxy: your configured hostname.

## Updating

From the Unraid web UI: click the container -> **Force update**. Migrations run automatically. The volume preserves the database and all uploads.
