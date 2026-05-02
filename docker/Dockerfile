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

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000 \
    STORAGE_PATH=/data/uploads \
    DB_PATH=/data/shares.db

# Non-root user (UID 10001 to avoid clash with common host users)
RUN addgroup -g 10001 -S app && \
    adduser  -u 10001 -S -G app -s /sbin/nologin -h /app app && \
    apk add --no-cache wget

WORKDIR /app

# API: deployed bundle (source + node_modules with native binaries)
COPY --from=builder --chown=app:app /deploy/api ./apps/api

# Web: static build output served by the Node adapter
COPY --from=builder --chown=app:app /app/apps/web/build ./apps/web/build

# Data volumes
RUN mkdir -p /data/uploads /data/db && chown -R app:app /data
VOLUME ["/data"]

USER 10001:10001
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget --quiet --spider --tries=1 http://127.0.0.1:3000/health || exit 1

CMD ["node", "apps/api/build/server.js"]
