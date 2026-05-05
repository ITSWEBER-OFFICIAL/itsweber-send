# Community Apps submission

Squid (Community Applications maintainer) does not run a PR-based intake.
Repositories get added via a forum post in the official CA support thread:

> [\[Plug-in\] Community Applications](https://forums.unraid.net/topic/38582-plug-in-community-applications/)

## Step 1 — Verify the repo is CA-ready

This repo already meets the CA conventions:

- Public GitHub repository under `ITSWEBER-OFFICIAL/itsweber-send`
- Template XML at a stable raw URL: <https://raw.githubusercontent.com/ITSWEBER-OFFICIAL/itsweber-send/main/unraid/itsweber-send.xml>
- Self-referencing `<TemplateURL>` so CA can refresh the entry
- Canonical `<Category>`: `Network-Web Productivity Cloud Security`
- Working `<Icon>`, `<Support>`, `<Project>`, `<Date>`, `<Beta>false</Beta>`, `<Changes>` block
- Container image is on a public registry: `ghcr.io/itsweber-official/itsweber-send:latest`
- AGPL-3.0-only license, README, CHANGELOG, SECURITY.md present
- Tested end-to-end on Unraid 7.x behind Nginx Proxy Manager

## Step 2 — Forum post template

Sign in at <https://forums.unraid.net/>, open the CA support thread linked above and reply with this:

```
Hi Squid,

Submitting a new template repository for inclusion in Community Applications.

Repo:     https://github.com/ITSWEBER-OFFICIAL/itsweber-send
Template: https://raw.githubusercontent.com/ITSWEBER-OFFICIAL/itsweber-send/main/unraid/itsweber-send.xml
Image:    ghcr.io/itsweber-official/itsweber-send:latest
License:  AGPL-3.0-only
Support:  https://github.com/ITSWEBER-OFFICIAL/itsweber-send/issues
Author:   info@itsweber.de

ITSWEBER Send is a self-hosted, end-to-end encrypted file-sharing service in
a single Docker container. AES-256-GCM in the browser, server only sees
ciphertext, resumable chunked uploads for files of arbitrary size, optional
accounts with TOTP 2FA, public-link or four-word handoff code, optional
SMTP first-download notifications.

Three deployment modes are supported in the same image: behind an existing
reverse proxy (default), LAN-direct with embedded Caddy + self-signed cert,
and public with a bundled Caddy + Let's Encrypt. The bundled XML defaults
to the reverse-proxy mode because that's the most common Unraid deployment.

Container is currently linux/amd64 only. Multi-arch returns once GitHub
provides native arm64 free runners or once we wire up a self-hosted
arm64 builder.

Please add the repository to the feed when you have a moment. Happy to
adjust anything that doesn't conform to current CA policy.

Thanks!
```

## Step 3 — While waiting for inclusion

Squid typically processes new repos within a few days. There is no automated
acknowledgement; the entry simply appears in CA after the next feed
regeneration cycle.

In the meantime, self-hosters can still install the container today via the
`wget` workflow documented in [`README.md`](../README.md#unraid-one-shot-template).

## Step 4 — After inclusion

Once the entry is live, ITSWEBER Send shows up in `Apps → Browse` on every
Unraid box. From that point on the recommendation in the README and wiki
should switch from `wget` to "search for `itsweber-send` in Apps".

When that happens, update:

- `README.md` and `README.de.md`: replace the `wget`-based Unraid section
  with a CA-search instruction.
- `docs/wiki/03-unraid-installation.md` and the German equivalent: same.
- `unraid/itsweber-send.xml` Overview: drop the post-apply `rm` step
  (CA's plugin manages templates differently and this work-around is no
  longer needed).
