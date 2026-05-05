#!/bin/sh
# Entrypoint with two deployment modes:
#
#   1. All-in-one (default) — embedded Caddy terminates TLS on 8443 with a
#      self-signed cert and reverse-proxies to Node on loopback:3000.
#      Suitable for direct LAN access without an external reverse proxy.
#
#   2. Reverse-proxy mode (REVERSE_PROXY_MODE=true) — Caddy is skipped and
#      Node binds 0.0.0.0:3000. Use this when an external reverse proxy
#      (NPM, Traefik, Nginx, Caddy-external) already terminates HTTPS in
#      front of the container.
#
# Caddy stores its self-signed certs under $XDG_DATA_HOME/caddy
# (= /data/caddy here) so they survive container restarts. /data is the
# only writable mount point — the rootfs is read-only.

set -e

if [ "${REVERSE_PROXY_MODE:-false}" = "true" ]; then
    # Bind on all interfaces so the upstream proxy (running outside the
    # container) can reach Node directly on port 3000.
    export HOST="${HOST:-0.0.0.0}"
    exec node apps/api/build/server.js
fi

export HOST="${HOST:-127.0.0.1}"

caddy run --config /etc/caddy/Caddyfile --adapter caddyfile &

# `exec` replaces this shell so Node becomes PID 1. SIGTERM from
# `docker stop` reaches Node directly; Node's graceful shutdown handlers
# get a chance to finish in-flight uploads / downloads before the kernel
# kills the container.
exec node apps/api/build/server.js
