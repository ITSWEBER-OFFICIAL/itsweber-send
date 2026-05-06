# Repository Layout

Definitive reference for the directory structure and what belongs where. If a
question about "where does X live?" comes up, this document is the answer.

## Top-level directories

| Path                    | Contents                                                 | In release artifact?  |
| ----------------------- | -------------------------------------------------------- | --------------------- |
| `apps/api/`             | Fastify 5 backend, tus upload protocol, storage adapters | yes                   |
| `apps/web/`             | SvelteKit 2 frontend, browser crypto, i18n DE/EN         | yes                   |
| `packages/crypto-spec/` | Open AES-256-GCM manifest format spec                    | yes                   |
| `packages/shared/`      | Shared TypeScript types                                  | yes                   |
| `packages/theme/`       | Design tokens (3-layer: primitives, semantic, component) | yes                   |
| `brand/logo/`           | Brand assets (SVG, PNG)                                  | yes                   |
| `docker/`               | Dockerfile, docker-compose variants                      | yes                   |
| `docs/`                 | Public documentation                                     | partially (see below) |
| `scripts/`              | Build / release tools (`prepare-release.mjs`)            | yes                   |
| `unraid/`               | Unraid Community Apps template XML                       | yes                   |
| `.github/`              | CI workflows, issue / PR templates, dependabot           | yes                   |

## Documentation conventions

`docs/` is mostly public. The following subdirectories are gitignored and never
appear in releases:

- `docs/internal/` — work-in-progress notes, briefings, planning material
- `docs/_archive/` — deprecated documentation
- `docs/audits/` — internal audit artifacts
- `docs/release-prep/` — pre-release checklists with private context
- `docs/previews/` — screenshots that ship in the repo for the README but get
  stripped from the build artifact

Public docs should be self-contained. No references to local Windows paths,
private email addresses, or internal team members.

## Asset rules

- Logos and brand marks: `brand/logo/` only. No duplicates anywhere else.
- Frontend assets that ship in the bundle: `apps/web/static/` or imported via
  Vite from `apps/web/src/lib/assets/`.
- No external CDNs at runtime. All dependencies vendored or part of the bundle.

## Files that must never be tracked

These are enforced both via `.gitignore` and via `scripts/prepare-release.mjs`
(`FORBIDDEN_BASENAMES` and `FORBIDDEN_DIRS`):

- `CLAUDE.md`, `AGENTS.md` (any depth) — internal AI workflow files
- `OPUS-BRIEFING.md`, `skills-lock.json`, `.cursorrules`
- `.claude/`, `.agents/`, `.continue/`, `memory/`
- `_archive/`, `docs/internal/`, `docs/_archive/`, `docs/audits/`,
  `docs/release-prep/`

`.env` and runtime data (`/uploads/`, `/data/`, `*.db`) are also gitignored.

## Branches

- `main` — release-ready code, what the public sees on GitHub.
- `chore/*`, `fix/*`, `feat/*` — short-lived feature branches with PR.
- No force-push to `main` without explicit, written approval.
