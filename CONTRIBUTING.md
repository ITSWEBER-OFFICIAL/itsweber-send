# Contributing to ITSWEBER Send

Thanks for taking the time to look at this. Before the first tagged release the project is moving fast and the API surface is unstable, so external contributions are best discussed via an issue first.

## Ground rules

- Be respectful. See [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).
- Security issues: do **not** open public issues. See [`.github/SECURITY.md`](.github/SECURITY.md).
- Match the existing style. Run `pnpm format` and `pnpm lint` before pushing.
- Conventional Commits, please: `feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `test:`, `build:`, `ci:`.
- Keep commits focused. Squash noise; don't squash semantic boundaries.
- Write a meaningful PR description: what changed, why, how to test.

## Development setup

```bash
pnpm install
pnpm dev    # runs apps/web (5173) and apps/api (3000) in parallel
```

Run the checks before pushing:

```bash
pnpm lint
pnpm typecheck
pnpm test
```

## Branching

- `main` is always releasable. Direct pushes are blocked once the public release is live.
- Feature branches: `feat/<short-name>`. Bugfixes: `fix/<short-name>`. Docs: `docs/<short-name>`.
- Open a draft PR early if you want feedback before the work is finished.

## Style

- TypeScript strict mode.
- Svelte 5 runes (`$state`, `$derived`, `$effect`) — no legacy stores in new code unless there is a reason.
- Tokens via `packages/theme`; no raw hex values in components.
- Inline SVG icons only (Lucide style as a reference). The `Icon` component lives in `apps/web/src/lib/components/icons/`.
- UI strings are localized. Add new strings to both `de.json` and `en.json`.

## Release process

Releases are cut by the maintainer once a milestone is verified locally and on the reference Unraid server. The release script (`scripts/prepare-release.mjs`) validates the artifact against the project allowlist before any image is pushed.
