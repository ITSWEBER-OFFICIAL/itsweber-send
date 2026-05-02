# Unraid-Installation

> [English](../03-unraid-installation.md)

## Manuelles Template

1. **Docker** -> **Container hinzufügen**
2. Felder unten ausfüllen
3. **Apply**

| Feld                 | Wert                                                                      |
| -------------------- | ------------------------------------------------------------------------- |
| Name                 | `itsweber-send`                                                           |
| Repository           | `ghcr.io/itsweber/itsweber-send:latest`                                   |
| Network type         | `Bridge`                                                                  |
| Restart policy       | `unless-stopped`                                                          |
| Port mapping         | `3000 -> 3000 (TCP)` (oder ein anderer Host-Port)                         |
| Volume mapping       | `/mnt/user/appdata/itsweber-send -> /data`                                |
| Variable: `NODE_ENV` | `production`                                                              |
| Variable: `BASE_URL` | `http://[UNRAID-IP]:3000` (oder Reverse-Proxy-URL)                        |
| Extra parameters     | `--security-opt no-new-privileges:true --read-only --tmpfs /tmp:size=64M` |
| Privileged           | Nein                                                                      |

## Mit Caddy via Compose

Wenn du ein dediziertes Build-Verzeichnis im Array hast:

```
/mnt/user/appdata/itsweber-send-build/docker/
  docker-compose.lan.yml
  Caddyfile.lan
```

Dann von der Unraid-CLI:

```bash
cd /mnt/user/appdata/itsweber-send-build/docker
docker compose -f docker-compose.lan.yml up -d
```

Caddy lauscht auf `:8443` mit selbst-signiertem TLS. Verbindung von jedem Gerät im LAN über `https://<unraid-ip>:8443`.

## Hinter einem bestehenden Reverse-Proxy

Wenn du bereits **Nginx Proxy Manager**, **SWAG** oder **Traefik** auf Unraid betreibst:

1. Nur `itsweber-send` starten (ohne separates Caddy). Host-Port `3000:3000` mappen.
2. Im Proxy einen Eintrag `send.deine-domain.tld` -> `http://[UNRAID-IP]:3000` anlegen.
3. `BASE_URL=https://send.deine-domain.tld` in den Container-Variablen setzen.
4. Sicherstellen, dass der Proxy die `Host`- und `X-Forwarded-Proto`-Header durchreicht.

Speziell für Nginx Proxy Manager: **Block Common Exploits** aus, **Websockets Support** an, und im Advanced-Tab folgendes ergänzen, damit der Rate-Limiter die richtige Client-IP sieht:

```
proxy_set_header X-Real-IP $remote_addr;
proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
```

## Zugriff

Direkt: `http://[UNRAID-IP]:3000`  
Mit Compose-LAN: `https://[UNRAID-IP]:8443`  
Hinter Reverse-Proxy: dein konfigurierter Hostname.

## Update

In der Unraid-Web-UI: Container anklicken -> **Force update**. Migrationen laufen automatisch. Das Volume bewahrt Datenbank und alle Uploads.
