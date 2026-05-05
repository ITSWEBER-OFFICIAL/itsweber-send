# Unraid-Installation

> [English](../03-unraid-installation.md)

Auf Unraid gibt es zwei Wege. Der erste nutzt das mitgelieferte XML-Template und ist die Empfehlung; der zweite ist die manuelle Eingabe.

## Variante 1 — Mitgeliefertes Template (empfohlen)

Im Repo liegt ein Unraid-Docker-Template unter [`unraid/itsweber-send.xml`](https://github.com/ITSWEBER-OFFICIAL/itsweber-send/blob/main/unraid/itsweber-send.xml). Auf den Unraid-USB legen, schon erscheint der Container im _Docker → Container hinzufügen → Vorlage_-Dropdown mit Image, Volume, Env-Variablen und Security-Flags vorausgefüllt.

**Schritt 1 — Datenverzeichnis vorab anlegen und auf den Runtime-User chownen.** Das Image läuft als Non-Root-User `10001:10001`. Ohne diesen Schritt kann SQLite die Datenbank nicht öffnen und der Container beendet sich beim Start.

```bash
mkdir -p /mnt/user/appdata/itsweber-send
chown -R 10001:10001 /mnt/user/appdata/itsweber-send
```

**Schritt 2 — Template installieren.**

```bash
wget -O /boot/config/plugins/dockerMan/templates-user/itsweber-send.xml \
  https://raw.githubusercontent.com/ITSWEBER-OFFICIAL/itsweber-send/main/unraid/itsweber-send.xml
```

**Schritt 3 — Container anlegen.**

1. _Docker → Container hinzufügen_
2. _Vorlage_-Dropdown → **itsweber-send**
3. Anpassen:
   - **Public URL** und **Base URL** auf deine öffentliche Domain (z. B. `https://send.example.com`)
   - **Netzwerktyp** auf eine Custom-Static-IP-Bridge (z. B. `br1`) und LAN-IP setzen. Host-Port-Mappings entfernen — dein Reverse-Proxy spricht den Container direkt unter der zugewiesenen LAN-IP an.
4. _Anwenden_

**Schritt 4 — Quell-Template nach dem ersten erfolgreichen Apply löschen.** Unraid behält sowohl die Quell-XML als auch eine `my-` prefixte Kopie des angewandten Zustands. Bei _Update_ / _Force Update_ kann Unraid auf die Quelle zurückfallen und deine Anpassungen überschreiben.

```bash
rm /boot/config/plugins/dockerMan/templates-user/itsweber-send.xml
```

Bei künftigen Releases den Zyklus wget + Apply + rm wiederholen. Dieser Workaround entfällt, sobald das Projekt regulär in den Community Apps Store eingereicht ist.

## Variante 2 — Manuelle Eingabe

_Docker → Container hinzufügen_ mit folgenden Feldern:

| Feld                      | Wert                                                                                               |
| ------------------------- | -------------------------------------------------------------------------------------------------- |
| Name                      | `itsweber-send`                                                                                    |
| Quelle                    | `ghcr.io/itsweber-official/itsweber-send:latest`                                                   |
| Netzwerktyp               | `Custom: br1` mit Static IP oder `Bridge` mit Port-Mapping                                         |
| Volume                    | `/mnt/user/appdata/itsweber-send → /data` (rw)                                                     |
| Env: `REVERSE_PROXY_MODE` | `true` (überspringt eingebetteten Caddy, Node bindet `0.0.0.0:3000`)                               |
| Env: `ORIGIN`             | `https://send.example.com` (öffentliche URL deines Reverse-Proxy)                                  |
| Env: `BASE_URL`           | gleich wie `ORIGIN`                                                                                |
| Env: `LOG_LEVEL`          | `info`                                                                                             |
| Extra-Parameter           | `--read-only --tmpfs /tmp:size=64m,mode=1777 --cap-drop=ALL --security-opt no-new-privileges:true` |

Der `chown`-Schritt ist bei beiden Varianten Pflicht:

```bash
mkdir -p /mnt/user/appdata/itsweber-send
chown -R 10001:10001 /mnt/user/appdata/itsweber-send
```

## Vor dem Container

Im Reverse-Proxy-Modus (`REVERSE_PROXY_MODE=true`) bietet der Container Plain-HTTP auf Port `3000`. Im Reverse-Proxy darauf weiterleiten. Snippets für Nginx Proxy Manager, Traefik, externes Caddy und vanilla Nginx in [`docs/REVERSE_PROXY.md`](https://github.com/ITSWEBER-OFFICIAL/itsweber-send/blob/main/docs/REVERSE_PROXY.md).

## LAN-Only-Deployment (ohne öffentliche Domain)

`REVERSE_PROXY_MODE=false` setzen (oder weglassen) und Port `8443` statt `3000` mappen. Der eingebettete Caddy terminiert dann HTTPS mit einem selbst signierten Zertifikat, damit Web Crypto auch im LAN funktioniert. `SEND_HOST` auf die LAN-IP setzen, die ins Cert gebrannt wird.
