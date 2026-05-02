# Fehlerbehebung

> [English](../90-troubleshooting.md)

## Web Crypto nicht verfügbar / Fehler beim Verschlüsseln

Web Crypto braucht einen **Secure Context**. Browser zählen `https://` und `http://localhost` als sicher, **nicht** aber `http://192.168.x.x` oder andere Plain-HTTP-IPs/Hosts. Symptome: Verschlüsselung schlägt still fehl, das Result-Panel erscheint nie, Konsole zeigt `TypeError: window.crypto.subtle is undefined`.

Lösung: App über HTTPS ausliefern. Das mitgelieferte LAN-Compose (`docker-compose.lan.yml`) macht das mit selbst-signiertem Zertifikat out-of-the-box. Siehe [02-docker-installation.md](02-docker-installation.md).

---

## "Kein Schlüssel im Link" auf einer Download-URL

Die geöffnete URL hat kein `#k=…`-Fragment. Mögliche Ursachen:

- Link wurde fehlerhaft kopiert (manche Chat-Clients schneiden URL-Fragmente ab — Paste-and-Edit testen)
- Empfänger hat nur einen 4-Wort-Code ohne Passwort erhalten (der Code findet die Share-ID, kann aber nicht entschlüsseln — siehe [10-sharing-flow.md](10-sharing-flow.md))

Für Voice-only-Sharing muss der Absender beim Upload ein Passwort setzen. Mit Code + Passwort entschlüsselt der Empfänger über die Passwort-Eingabe.

---

## "Kein Share mit diesem Wort-Code gefunden"

Der 4-Wort-Code lieferte keine Share-ID. Ursachen:

- Tippfehler — Codes sind case-insensitive, jedes Wort muss aber exakt stimmen
- Share ist abgelaufen oder wurde gelöscht
- Frontend- und Backend-Wortliste sind auseinandergedriftet (sollte in einem sauberen v1.0+-Deployment nicht passieren)

Bei selbst gebauten Images: prüfen, ob `apps/api/src/utils/wordcode.ts` und `apps/web/src/lib/share/wordcode.ts` identische 255-Eintrag-Arrays haben.

---

## Login wird unerwartet rate-limited

Login: 5 Versuche pro IP pro Minute. Registrierung: 3 pro IP pro 10 Minuten. Hinter einem Reverse-Proxy, der Client-IPs nicht korrekt weiterreicht, sieht der Server alle Requests als gleicher Client — Rate-Limits greifen sofort.

Lösung: Sicherstellen, dass der Proxy `X-Forwarded-For` mit der **reinen Client-IP** weiterreicht, nicht `ip:port`. Caddy's Platzhalter `{remote_host}` ist korrekt; der ältere `{remote}` enthält `ip:port` und bricht das Rate-Limiting.

---

## Container startet, aber `/health` antwortet 503

`/ready` antwortet 503, wenn die SQLite-Probe fehlschlägt. Ursachen:

- Volume nicht beschreibbar für UID 10001 — `chown 10001:10001` auf das Host-Verzeichnis
- Read-only Rootfs ohne beschreibbares `/data` oder `/tmp` — `tmpfs`-Mount wieder aktivieren
- Disk voll

`docker logs itsweber-send` zeigt den darunter liegenden SQLite-Fehler.

---

## Pre-built Image schlägt mit `--frozen-lockfile` auf Unraid fehl

Nur relevant beim lokalen Bauen. `pnpm install` regeneriert die Lockfile, dann neu bauen:

```bash
pnpm install
docker build -f docker/Dockerfile -t itsweber-send:dev .
```

---

## TLS-Zertifikat wird nicht ausgestellt

Caddy braucht Ports 80 und 443 vom öffentlichen Internet erreichbar, um die ACME-Challenge abzuschließen. Hinter einem anderen Reverse-Proxy: LAN-Compose nutzen (`tls internal`) oder TLS am Upstream-Proxy terminieren und ITSWEBER Send ohne Caddy laufen lassen.

---

## 2FA-Codes werden immer abgelehnt

Die TOTP-Implementierung akzeptiert ein Clock-Skew-Fenster von ±1 Schritt (±30 s). Außerhalb davon schlagen Codes fehl. Prüfen:

- Host-Uhr synchronisiert (`timedatectl status` auf Linux, Settings -> Zeit auf Unraid)
- Authenticator-Geräteuhr korrekt
- Base32-Secret ohne führende/nachfolgende Leerzeichen gescannt

Wenn ein Nutzer ausgesperrt ist und der Uhr-Fix nicht hilft: Admin kann `users.totp_enabled = 0` per SQLite setzen. Siehe [11-konto-und-2fa.md](11-konto-und-2fa.md).

---

## Upload bleibt bei 100 % stehen

Der Browser hat alle Bytes gesendet; der Server schreibt jetzt den Blob auf den Storage. Bei großen Dateien auf langsamen Disks (oder S3 mit hoher Latenz) kann das mehrere Sekunden dauern. Hängt es länger als ~60 s:

- `docker logs itsweber-send` auf Storage-Fehler prüfen
- Disk-Space und Schreibrechte auf `/data`
- Bei S3: existiert der Bucket, sind die Credentials korrekt?

---

## Mehr

Die In-App-Seite `/docs` enthält aktuelle FAQ-Einträge, und im Quellbaum dokumentiert `docs/TROUBLESHOOTING.md` Lessons aus früheren Milestones.
