# Docker-Installation

> [English](../02-docker-installation.md)

## Voraussetzungen

- Docker 24+ oder Docker Desktop 4.x
- Docker Compose 2.20+
- Ein öffentlicher Hostname, der auf den Server zeigt (für Produktion mit TLS)
- Ports 80 und 443 frei am Host (für Caddy)

---

## Produktion mit Caddy + TLS

### 1. Compose-Datei herunterladen

```bash
curl -O https://raw.githubusercontent.com/itsweber/itsweber-send/main/docker/docker-compose.yml
curl -O https://raw.githubusercontent.com/itsweber/itsweber-send/main/docker/Caddyfile.example
```

### 2. Hostname setzen

Bearbeite `Caddyfile.example`, ersetze `send.example.com` durch deine Domain. Speichere als `Caddyfile`.

### 3. Starten

```bash
BASE_URL=https://send.example.com docker compose up -d
```

Caddy holt beim ersten Start ein Let's-Encrypt-Zertifikat. Nach etwa 30 Sekunden ist der Dienst unter `https://send.example.com` erreichbar.

### Was läuft

| Container             | Image                                   | Zweck                                    |
| --------------------- | --------------------------------------- | ---------------------------------------- |
| `itsweber-send`       | `ghcr.io/itsweber/itsweber-send:latest` | Anwendung (API + SSR-Frontend)           |
| `itsweber-send-caddy` | `caddy:2-alpine`                        | TLS-Reverse-Proxy, Security-Header-Layer |

Die Anwendung lauscht intern auf `:3000` und ist **nicht** öffentlich exponiert. Nur Caddy bindet die Host-Ports `:80` und `:443`.

---

## LAN / Home-Lab (selbst-signiertes TLS)

Für Tests im lokalen Netz ohne öffentliche Domain:

```bash
docker compose -f docker/docker-compose.lan.yml up -d
```

Caddy nutzt `tls internal` für ein selbst-signiertes Zertifikat. Browser zeigen beim ersten Besuch eine Warnung — einmalig als Ausnahme hinzufügen.

Das LAN-Compose bindet Host-Port `:8443` (statt `:443`), damit es neben anderen Services laufen kann. Verbindung über `https://<host-ip>:8443`.

---

## Persistente Daten

Standardmäßig hält ein Docker-Volume `send-data` den gesamten Zustand:

```
send-data/
  shares.db        # SQLite-Datenbank (better-sqlite3)
  uploads/         # verschlüsselter Blob-Speicher
```

Um stattdessen ein Host-Verzeichnis zu nutzen:

```yaml
volumes:
  - /srv/itsweber-send:/data
```

Sicherstellen, dass das Verzeichnis von UID 10001 (dem `app`-Nutzer im Container) beschreibbar ist.

---

## Update

```bash
docker compose pull
docker compose up -d
```

DB-Migrationen werden beim Container-Start automatisch angewendet. Zwischen Patch- und Minor-Releases sind keine manuellen SQL-Schritte nötig.

---

## Backup

Das Volume enthält den gesamten Zustand. Container stoppen, Volume kopieren, neu starten:

```bash
docker compose stop itsweber-send
docker run --rm -v send-data:/data -v $PWD:/backup alpine \
  tar czf /backup/send-backup-$(date +%F).tar.gz /data
docker compose start itsweber-send
```

Bei S3-Storage liegt nur `shares.db` im Volume — die Blobs leben im Bucket und brauchen ein eigenes Backup.

---

## Aus dem Quellcode bauen

```bash
git clone https://github.com/itsweber/itsweber-send
cd itsweber-send
pnpm install
docker build -f docker/Dockerfile -t itsweber-send:dev .
```
