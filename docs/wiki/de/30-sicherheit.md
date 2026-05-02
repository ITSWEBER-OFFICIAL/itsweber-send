# Sicherheits-Architektur

> [English](../30-security.md)

Kurzform: Der Browser hält den Schlüssel, der Server hält opaken Ciphertext. Eine vollständige Server-Kompromittierung verrät Größen und Timing — aber nie Klartext, Dateinamen oder MIME-Typen.

Die vollständige kryptografische Spezifikation liegt in [packages/crypto-spec/README.md](../../../packages/crypto-spec/README.md).

---

## Threat-Model

| Bedrohung | Mitigation |
| --- | --- |
| Kompromittierter Server / Hoster | E2E-Verschlüsselung: Server speichert nur Ciphertext. Master-Key lebt im URL-Fragment, wird nie an den Server gesendet. |
| Passiver Netzwerkbeobachter | TLS 1.3 via Caddy, HSTS mit zwei Jahren `max-age` und `preload`. |
| Brute-Force gegen Konten | Login: 5 / min / IP. Registrierung: 3 / 10 min / IP. Constant-Time-Hash auch bei nicht existenten Konten. |
| Cross-Site-Scripting | Strikte CSP: nur Same-Origin-Skripte, keine Drittanbieter-CDNs. `dangerouslySetInnerHTML` ist verboten. |
| Share-ID-Enumeration | 96-Bit-Random-IDs (`crypto.randomBytes(12)`). Kollisions-Wahrscheinlichkeit in jedem realistischen Setup vernachlässigbar. |
| Passwort-Raten gegen Shares | Argon2id (Konten) und PBKDF2 200 000 Iterationen (Share-Passwörter). Beides läuft auf dem Gerät desjenigen, der das Passwort hält — der Server kann nicht raten. |

**Außerhalb des Scope:** Wer die vollständige Share-URL (mit `#k=…`) hat, kann den Share entschlüsseln. Die URL ist die Capability — by Design.

---

## Kryptografische Primitive

| Zweck | Primitiv | Parameter |
| --- | --- | --- |
| Datei-Verschlüsselung | AES-256-GCM | 256-Bit-Key, 96-Bit-IV, 128-Bit Auth-Tag |
| Manifest-Verschlüsselung | AES-256-GCM | Gleicher Key wie Datei, separater IV |
| Passwort-Key-Wrap | PBKDF2-SHA-256 | 200 000 Iterationen, 128-Bit-Salt |
| Konto-Passwörter | Argon2id | OWASP 2026: 64 MB Speicher, t=3, p=4 |
| Zufall | Web Crypto / `node:crypto` | Nur CSPRNG |
| Encoding | base64url | RFC 4648 §5 |

---

## Was der Server sieht und was nicht

**Sieht**

- Opake Blobs (Ciphertext) — Größen sind sichtbar
- Share-Metadaten: Erstellung, Ablauf, Download-Limit, ob Passwort gesetzt ist
- Bei passwortgeschützten Shares: Wrapping-Material (`salt`, `iv_wrap`, `wrapped_key`) — nie das Passwort selbst
- IP-Adressen abhängig von Log-Retention

**Sieht nicht**

- Dateiinhalte
- Dateinamen
- MIME-Typen
- Den Master-Key

---

## HTTP-Security-Header

Auf jede Antwort gesetzt durch `@fastify/helmet`, von Caddy als Defense-in-Depth dupliziert:

- `Content-Security-Policy` — nur Same-Origin, kein Inline-Script (das Theme-Init-Script lebt in `static/theme-init.js`)
- `Cross-Origin-Opener-Policy: same-origin`
- `Cross-Origin-Embedder-Policy: credentialless`
- `Cross-Origin-Resource-Policy: same-origin`
- `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`
- `Referrer-Policy: no-referrer`
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `Permissions-Policy` deaktiviert Kamera, Mikrofon, Geolocation, Payment, USB, MIDI, Sensors, XR, Display-Capture, Encrypted-Media — alle nicht benötigten Browser-APIs

---

## Container-Härtung

Das Runtime-Image (`docker/Dockerfile`) und die mitgelieferten Compose-Dateien wenden an:

- Läuft als UID 10001, nie als root
- `read_only: true` Rootfs; nur `/tmp` über 64-MiB-tmpfs beschreibbar
- `cap_drop: ALL` — keine Linux-Capabilities
- `security_opt: no-new-privileges:true`
- Healthcheck implementiert in Node's eingebettetem `http`-Modul — kein `wget` oder `curl` im Runtime-Image
- OCI-Image-Labels für Source-Repository und Lizenz

---

## Dependency-Scanning

Die CI führt Trivy gegen das Container-Image bei jedem Push auf `main` aus. HIGH- und CRITICAL-Findings blockieren Releases. Trivy-Ergebnisse erscheinen in der GitHub-Actions-Summary jedes PRs.

---

## Schwachstellen melden

Siehe [`.github/SECURITY.md`](../../../.github/SECURITY.md) für den privaten Disclosure-Prozess.
