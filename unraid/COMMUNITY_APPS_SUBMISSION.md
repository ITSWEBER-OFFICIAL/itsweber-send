# Community Apps submission

Repositories are added to Squid's Community Applications feed by opening a
GitHub Issue at the CA project. Recent successful submissions follow this
pattern (see [issues #14, #17, #18, #26](https://github.com/Squidly271/community.applications/issues?q=is%3Aissue+add)
for examples).

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

Go to <https://github.com/Squidly271/community.applications/issues/new> while
signed in to GitHub.

**Title:**

```
Add ITSWEBER Send to Community Applications
```

**Body:**

```markdown
### Application Name
ITSWEBER Send

### GitHub Template URL
https://raw.githubusercontent.com/ITSWEBER-OFFICIAL/itsweber-send/main/unraid/itsweber-send.xml

### Container Image
ghcr.io/itsweber-official/itsweber-send:latest

### Repository
https://github.com/ITSWEBER-OFFICIAL/itsweber-send

### Overview
Self-hosted, end-to-end encrypted file sharing in a single Docker container.
AES-256-GCM in the browser, server only sees ciphertext, resumable chunked
uploads for files of any size, optional accounts with TOTP 2FA (with
scannable QR), public link / four-word handoff code / QR sharing, optional
SMTP first-download notifications.

Three deployment modes are supported in the same image: behind an existing
reverse proxy (default for the template), LAN-direct with embedded Caddy +
self-signed cert, and public with a bundled Caddy + Let's Encrypt.

### Support
https://github.com/ITSWEBER-OFFICIAL/itsweber-send/issues

### Icon URL
https://raw.githubusercontent.com/ITSWEBER-OFFICIAL/itsweber-send/main/brand/logo/itsweber-send-mark.png

### License
AGPL-3.0-only

### Notes
- Container is currently linux/amd64 only. Multi-arch returns once GitHub
  provides native arm64 free runners or once a self-hosted arm64 builder
  is wired in.
- Image runs as the unprivileged user UID 10001:10001. The bundled XML
  Overview includes a one-line chown step the operator must run on their
  host bind-mount before the first Apply, otherwise SQLite fails to open.
  The entrypoint prints an actionable error if /data is not writable.

Happy to adjust anything that does not conform to current CA policy.
Thank you!
```

## Step 3 — While waiting for inclusion

Squid (or a CA maintainer) typically processes new repositories within a few
days to a week. There is no automated acknowledgement; the entry simply
shows up under *Apps → Browse* on every Unraid box after the next feed
regeneration cycle.

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
