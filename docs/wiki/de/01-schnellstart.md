# Schnellstart

> [English](../01-quick-start.md)

## Docker (One-Liner)

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

Im Browser öffnen: [http://localhost:3000](http://localhost:3000).

> Web Crypto braucht einen Secure Context. Plain `http://` funktioniert nur auf `localhost` — bei jedem anderen Hostnamen oder einer IP brauchst du HTTPS. Siehe [02-docker-installation.md](02-docker-installation.md) für das Caddy-Setup mit TLS.

## docker-compose

```yaml
services:
  itsweber-send:
    image: ghcr.io/itsweber/itsweber-send:latest
    container_name: itsweber-send
    restart: unless-stopped
    ports:
      - "3000:3000"
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
- Zwei-Faktor-Authentifizierung (TOTP)
- Audit-Log aller Aktionen am Konto

Siehe [11-konto-und-2fa.md](11-konto-und-2fa.md).

## Konfiguration

Alle Einstellungen über Umgebungsvariablen. Minimum für Produktion:

| Variable | Pflicht | Beschreibung |
| --- | --- | --- |
| `BASE_URL` | ja | Öffentliche URL des Dienstes |
| `NODE_ENV` | ja | Auf `production` setzen |
| `STORAGE_BACKEND` | nein | `filesystem` (Default) oder `s3` |
| `ENABLE_ACCOUNTS` | nein | `true` (Default) oder `false` |

Vollständige Referenz in der App unter `/docs/config` oder in [docs/CONFIG.md](../../CONFIG.md).
