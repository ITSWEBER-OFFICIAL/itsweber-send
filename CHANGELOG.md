# Changelog

All notable changes to ITSWEBER Send are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Initial monorepo skeleton (M1): pnpm workspaces, Turborepo, TypeScript baseline
- `packages/theme` with primitive tokens, light/dark presets and semantic CSS variables
- `packages/shared` with shared types and validators
- `packages/crypto-spec` with the file-format and key-derivation specification
- `apps/web` SvelteKit skeleton with theme store, BrandMark, icon library and German/English i18n scaffolding
- `apps/api` Fastify skeleton with `/health` endpoint and plugin slots for upload/download/auth
- `docker/Dockerfile` (multi-stage, non-root, alpine) and minimal compose stack with Caddy
- GitHub Actions workflow scaffolding (CI; release pipeline gated until M6)
- Brand assets: logo "Paper Plane Crypt" as standalone SVG with usage guidelines
- Release validation script that enforces an allowlist of repository paths
