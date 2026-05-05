# Unraid Installation

> [Deutsch](de/03-unraid-installation.md)

Two practical paths on Unraid. The first uses the bundled XML template and is recommended; the second is a manual fill-in.

## Option 1 — Bundled template (recommended)

The repo ships an Unraid Docker template at [`unraid/itsweber-send.xml`](https://github.com/ITSWEBER-OFFICIAL/itsweber-send/blob/main/unraid/itsweber-send.xml). Drop it onto the Unraid USB and the container appears in the _Docker → Add Container → Template_ dropdown with image, volume, env vars and security flags pre-filled.

**Step 1 — pre-create the data directory and chown to the runtime user.** The image runs as the non-root UID `10001:10001`. Without this step SQLite refuses to open the database file and the container exits on start.

```bash
mkdir -p /mnt/user/appdata/itsweber-send
chown -R 10001:10001 /mnt/user/appdata/itsweber-send
```

**Step 2 — install the template.**

```bash
wget -O /boot/config/plugins/dockerMan/templates-user/itsweber-send.xml \
  https://raw.githubusercontent.com/ITSWEBER-OFFICIAL/itsweber-send/main/unraid/itsweber-send.xml
```

**Step 3 — apply the container.**

1. _Docker → Add Container_
2. _Template_ dropdown → **itsweber-send**
3. Adjust:
   - **Public URL** and **Base URL** to your public domain (e.g. `https://send.example.com`)
   - **Network type** to a custom static-IP bridge (e.g. `br1`) and set the LAN IP. Clear the host-port mappings — your reverse proxy reaches the container directly on the assigned LAN IP.
4. _Apply_

**Step 4 — delete the source template after the first successful Apply.** Unraid keeps both the source XML and a `my-` prefixed copy of the user-applied state. On _Update_ / _Force Update_ it can fall back to the source and overwrite your customisations.

```bash
rm /boot/config/plugins/dockerMan/templates-user/itsweber-send.xml
```

For future releases repeat the wget + Apply + rm cycle. This work-around is gone once the project is on Community Apps proper.

## Option 2 — Manual fill-in

_Docker → Add Container_ with these fields:

| Field                     | Value                                                                                              |
| ------------------------- | -------------------------------------------------------------------------------------------------- |
| Name                      | `itsweber-send`                                                                                    |
| Repository                | `ghcr.io/itsweber-official/itsweber-send:latest`                                                   |
| Network type              | `Custom: br1` with static IP, or `Bridge` with port mapping                                        |
| Volume                    | `/mnt/user/appdata/itsweber-send → /data` (rw)                                                     |
| Env: `REVERSE_PROXY_MODE` | `true` (skips embedded Caddy, binds Node on `0.0.0.0:3000`)                                        |
| Env: `ORIGIN`             | `https://send.example.com` (public URL served by your reverse proxy)                               |
| Env: `BASE_URL`           | same as `ORIGIN`                                                                                   |
| Env: `LOG_LEVEL`          | `info`                                                                                             |
| Extra parameters          | `--read-only --tmpfs /tmp:size=64m,mode=1777 --cap-drop=ALL --security-opt no-new-privileges:true` |

Pre-chown is required for both options:

```bash
mkdir -p /mnt/user/appdata/itsweber-send
chown -R 10001:10001 /mnt/user/appdata/itsweber-send
```

## In front of the container

In Reverse-Proxy mode (`REVERSE_PROXY_MODE=true`) the container exposes plain HTTP on port `3000`. Forward your public hostname there. Copy-paste snippets for Nginx Proxy Manager, Traefik, external Caddy and vanilla Nginx are in [`docs/REVERSE_PROXY.md`](https://github.com/ITSWEBER-OFFICIAL/itsweber-send/blob/main/docs/REVERSE_PROXY.md).

## LAN-only deployment (no public domain)

Set `REVERSE_PROXY_MODE=false` (or unset) and map port `8443` instead of `3000`. The image's embedded Caddy then terminates HTTPS with a self-signed certificate so Web Crypto works over the LAN. Set `SEND_HOST` to the LAN IP that gets baked into the cert.
