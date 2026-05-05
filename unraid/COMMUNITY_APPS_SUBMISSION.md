# Community Apps submission

CA submissions land as GitHub Issues at <https://github.com/Squidly271/AppFeed/issues>.
The two earlier ITSWEBER submissions (#27 itsweber-mesh, #28 itsweber-tools)
use the format below; the same shape works here.

## Step 1 — Verify the repo is CA-ready

This repo already meets the CA conventions:

- Public GitHub repository under `ITSWEBER-OFFICIAL/itsweber-send`
- Template XML at a stable raw URL: <https://raw.githubusercontent.com/ITSWEBER-OFFICIAL/itsweber-send/main/unraid/itsweber-send.xml>
- Self-referencing `<TemplateURL>` so CA can refresh the entry on its own
- Canonical `<Category>`: `Network-Web Productivity Cloud Security`
- Working `<Icon>`, `<Support>`, `<Project>`, `<Date>`, `<Beta>false</Beta>`, `<Changes>` block
- Container image is on a public registry: `ghcr.io/itsweber-official/itsweber-send:latest`
- AGPL-3.0-only license, README, CHANGELOG, SECURITY.md present
- Tested end-to-end on Unraid 7.x behind Nginx Proxy Manager

## Step 2 — Open the submission issue

Go to <https://github.com/Squidly271/AppFeed/issues/new> while signed in.

**Title:**

```
Add ITSWEBER Send — end-to-end encrypted file sharing
```

**Body:**

```markdown
Hi Squid, please consider adding ITSWEBER Send to the Community Applications feed.

**Template URL:**
https://raw.githubusercontent.com/ITSWEBER-OFFICIAL/itsweber-send/main/unraid/itsweber-send.xml

**Container image (GHCR, public):**
`ghcr.io/itsweber-official/itsweber-send:latest`

**Project / Support / License:**
- Project: https://github.com/ITSWEBER-OFFICIAL/itsweber-send
- Support: https://github.com/ITSWEBER-OFFICIAL/itsweber-send/issues
- License: AGPL-3.0
- Maintainer: Maniskryptus (ITSWEBER)
- Category: `Network-Web Productivity Cloud Security`

**Icon:**
https://raw.githubusercontent.com/ITSWEBER-OFFICIAL/itsweber-send/main/brand/logo/itsweber-send-mark.png

**Screenshot:**
https://raw.githubusercontent.com/ITSWEBER-OFFICIAL/itsweber-send/main/docs/previews/screenshots/01-upload-dark.png

**Overview:**
ITSWEBER Send is self-hosted, end-to-end encrypted file sharing in a single Docker container — files are encrypted in the browser (AES-256-GCM, key in URL fragment) before they touch the server, the server only ever sees ciphertext. Resumable chunked uploads handle files of arbitrary size; downloads stream straight to disk via the File System Access API where supported. Sharing options include the standard public link, a four-word handoff code for voice, and a QR code. Optional accounts add TOTP 2FA (with scannable QR), API tokens, audit log, per-user quotas and an admin panel with email-template editor and SMTP test button.

**Default container behaviour:**
- Three deployment modes in the same image, switchable via `REVERSE_PROXY_MODE`:
  1. **Behind reverse proxy** (default for the template) — Caddy is skipped, Node binds `0.0.0.0:3000`. Works behind NPM, Traefik, external Caddy, vanilla Nginx.
  2. **LAN direct** — embedded Caddy serves HTTPS on `8443` with a self-signed cert so Web Crypto works over the LAN.
  3. **Public + bundled Caddy + Let's Encrypt** — separate Compose file in the repo.
- Persistent volume: `/data` → `/mnt/user/appdata/itsweber-send` (SQLite + encrypted blobs)
- Container runs as non-root UID `10001:10001`, read-only rootfs, all caps dropped, `no-new-privileges`. Bundled Overview includes the one-line chown step the operator runs once before first Apply.
- Required env vars: `ORIGIN` and `BASE_URL` (public URL the service is reachable under)
- Optional reverse-proxy guide in the repo: `docs/REVERSE_PROXY.md`

Image is built and pushed via GitHub Actions on every tag (semver only — pre-release tags do not move `:latest`). Current release: **v1.3.5**. Image is currently `linux/amd64` only; arm64 returns once GitHub provides native arm64 free runners.

Thanks!
```

## Step 3 — While waiting for inclusion

Squid (or a CA maintainer) typically processes new repositories within a few
days. There is no automated acknowledgement; the entry simply shows up under
*Apps → Browse* on every Unraid box after the next feed regeneration cycle.

In the meantime, self-hosters can still install the container today via the
`wget` workflow documented in [`README.md`](../README.md#unraid-one-shot-template).

## Step 4 — After inclusion

Once the entry is live, ITSWEBER Send shows up in *Apps → Browse* on every
Unraid box. From that point on, the README and wiki recommendation should
switch from `wget` to "search for `itsweber-send` in Apps".

When that happens, update:

- `README.md` and `README.de.md`: replace the `wget`-based Unraid section
  with a CA-search instruction.
- `docs/wiki/03-unraid-installation.md` and the German equivalent: same.
- `unraid/itsweber-send.xml` Overview: drop the post-apply `rm` step
  (CA's plugin manages templates differently and that work-around is no
  longer needed once a user installs via Apps).
