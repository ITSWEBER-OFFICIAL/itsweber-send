# Schnellstart

> [English](../01-quick-start.md)

Das Image bringt drei Deployment-Modi mit. Wähle den, der zu deinem Setup passt, und komm dann hierher zurück für die Post-Install-Anleitung.

## Modus 1 — LAN direkt (eingebetteter Caddy, Self-Signed TLS)

Für ein Homelab mit statischer LAN-IP, ohne öffentliche Domain.

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

`https://192.168.1.100:8443` öffnen und das Self-Signed-Zertifikat einmal akzeptieren.

## Modus 2 — Hinter deinem bestehenden Reverse-Proxy

Für Setups, in denen Nginx Proxy Manager, Traefik, ein externer Caddy oder ein vanilla Nginx schon HTTPS mit echtem Zertifikat terminiert. Der eingebettete Caddy wird deaktiviert — keine doppelte TLS-Termination.

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

Im Reverse-Proxy auf Port `3000` per HTTP weiterleiten. Detaillierte Reverse-Proxy-Snippets: [`docs/REVERSE_PROXY.md`](https://github.com/ITSWEBER-OFFICIAL/itsweber-send/blob/main/docs/REVERSE_PROXY.md).

## Modus 3 — Public mit gebündeltem Caddy + Let's Encrypt

Für Single-Server-Deployments mit freien Ports `80` / `443` und ohne anderen Proxy davor. Siehe [02-docker-installation.md](02-docker-installation.md) für die Compose-Datei mit dem gebündelten Caddy-Container.

## docker-compose (Modus 2 Beispiel)

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

## Erste Schritte

1. Web-UI öffnen — eine oder mehrere Dateien in die Upload-Zone ziehen
2. Ablaufzeit, Download-Limit und (optional) Passwort setzen
3. **Verschlüsseln & hochladen** — der Browser verschlüsselt mit AES-256-GCM
4. Den langen Link (mit `#k=…`), den 4-Wort-Code oder den QR-Code teilen
5. Empfänger öffnet den Link — Dateien werden im Browser entschlüsselt

## Optionales Konto

In der Navigation auf **Konto** klicken und registrieren. Der erste registrierte Nutzer wird automatisch Admin und erhält das Admin-Panel unter `/admin`. Konten schalten frei:

- Upload-Historie mit Quota-Tracking
- API-Tokens für programmatische Uploads
- Zwei-Faktor-Authentifizierung (TOTP) mit scannbarem QR-Code beim Setup
- Audit-Log aller Aktionen am Konto

Siehe [11-konto-und-2fa.md](11-konto-und-2fa.md).

## Konfiguration

Minimum für Produktion:

| Variable             | Pflicht | Beschreibung                                                                         |
| -------------------- | ------- | ------------------------------------------------------------------------------------ |
| `REVERSE_PROXY_MODE` | nein    | `true` deaktiviert eingebetteten Caddy, Node bindet `0.0.0.0:3000`                   |
| `ORIGIN`             | ja      | Öffentliche URL für Share-Links und Cookie-Scope                                     |
| `BASE_URL`           | ja      | Wie `ORIGIN`, vom SvelteKit-Frontend genutzt                                         |
| `SEND_HOST`          | Mod. 1  | LAN-IP oder Hostname, der ins Self-Signed-Cert des eingebetteten Caddy gebrannt wird |
| `STORAGE_BACKEND`    | nein    | `filesystem` (Default) oder `s3`                                                     |
| `ENABLE_ACCOUNTS`    | nein    | `true` (Default) oder `false`                                                        |

Vollständige Referenz in [docs/CONFIG.md](https://github.com/ITSWEBER-OFFICIAL/itsweber-send/blob/main/docs/CONFIG.md).
