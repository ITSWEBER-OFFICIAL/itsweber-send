# syntax=docker/dockerfile:1.7

# ----- Build stage ----------------------------------------------------------
FROM node:22-alpine AS builder

# Native module build tools (required for better-sqlite3)
RUN apk add --no-cache python3 make g++

WORKDIR /app

# Install pnpm via corepack
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate

# Copy workspace manifests first to maximise Docker layer cache hits
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY apps/web/package.json apps/web/
COPY apps/api/package.json apps/api/
COPY packages/theme/package.json packages/theme/
COPY packages/shared/package.json packages/shared/
COPY packages/crypto-spec/package.json packages/crypto-spec/

RUN --mount=type=cache,id=pnpm,target=/pnpm-store \
    pnpm config set store-dir /pnpm-store && \
    pnpm install --frozen-lockfile

# Copy the rest of the source tree
COPY . .

# Build web (SvelteKit -> apps/web/build/) and api (tsc -> apps/api/build/)
RUN pnpm build

# Deploy API as a self-contained production bundle (pnpm resolves all workspace deps)
RUN pnpm --filter @itsweber-send/api deploy --prod /deploy/api

# ----- Runtime stage --------------------------------------------------------
FROM node:22-alpine AS runtime

LABEL org.opencontainers.image.title="ITSWEBER Send" \
      org.opencontainers.image.description="Self-hosted, end-to-end encrypted file sharing." \
      org.opencontainers.image.source="https://github.com/ITSWEBER-OFFICIAL/itsweber-send" \
      org.opencontainers.image.licenses="AGPL-3.0-only"

ENV NODE_ENV=production \
    PORT=3000 \
    STORAGE_PATH=/data/uploads \
    DB_PATH=/data/shares.db \
    XDG_DATA_HOME=/data \
    XDG_CONFIG_HOME=/data/caddy-config

# HOST is intentionally not set here. The entrypoint picks the bind
# address based on the deployment mode: 127.0.0.1 in all-in-one mode
# (Caddy proxies on loopback), 0.0.0.0 in REVERSE_PROXY_MODE. A user
# explicitly setting HOST overrides both.

# Caddy provides HTTPS termination on 8443 inside the same container so
# the deployment is a single image with a single port. Caddy stores its
# self-signed certs under $XDG_DATA_HOME/caddy (= /data/caddy) so they
# survive container restarts. The image stays small — alpine's caddy
# package is ~25 MB.
RUN apk add --no-cache caddy

# Non-root user (UID 10001 to avoid clash with common host users).
# No extra packages installed: the healthcheck uses node's built-in http module
# so we do not ship wget/curl, keeping the attack surface minimal.
RUN addgroup -g 10001 -S app && \
    adduser  -u 10001 -S -G app -s /sbin/nologin -h /app app

WORKDIR /app

# API: deployed bundle (source + node_modules with native binaries)
COPY --from=builder --chown=app:app /deploy/api ./apps/api

# Web: static build output served by the Node adapter
COPY --from=builder --chown=app:app /app/apps/web/build ./apps/web/build

# Caddy reverse-proxy + entrypoint
COPY docker/Caddyfile.aio /etc/caddy/Caddyfile
COPY docker/entrypoint.sh /entrypoint.sh
RUN chmod 0755 /entrypoint.sh

# Data volumes — owned by the unprivileged user so a read-only rootfs at
# runtime still allows uploads to be written under /data, and so Caddy
# can place its cert / config dirs alongside.
RUN mkdir -p /data/uploads /data/db /data/caddy /data/caddy-config && \
    chown -R app:app /data
VOLUME ["/data"]

# 8443 is an unprivileged port (>=1024) so the unprivileged user can
# bind it without setcap / NET_BIND_SERVICE. If you ever switch to
# 80/443 you'll need `apk add libcap` plus `setcap cap_net_bind_service`,
# OR a fronting reverse proxy on the host that maps the public ports.

USER 10001:10001
# 8443 is exposed by the embedded Caddy in all-in-one mode.
# 3000 is exposed by Node directly in REVERSE_PROXY_MODE=true.
# IMPORTANT: this image runs as a non-root user. Bind-mounted /data
# directories must be owned by UID 10001:10001 on the host, otherwise
# SQLite fails to open with SQLITE_CANTOPEN. The entrypoint prints a
# diagnostic message before exiting if /data is not writable.
EXPOSE 8443 3000

# Container is meant to run with `--read-only` and `--tmpfs /tmp:size=64m,mode=1777`.
# Healthcheck hits the Node API directly on loopback so a momentary Caddy
# hiccup does not flap the container's liveness state.
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:'+(process.env.PORT||3000)+'/health',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))" || exit 1

CMD ["/entrypoint.sh"]
