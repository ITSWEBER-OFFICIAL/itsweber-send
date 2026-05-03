#!/bin/sh
# All-in-one entrypoint: starts Caddy in the background and runs Node in
# the foreground. Container exits when Node exits; the kernel reaps
# Caddy as an orphan.
#
# Caddy stores its self-signed certs under $XDG_DATA_HOME/caddy (= /data
# /caddy here) so they survive container restarts. /data is the only
# writable mount point — the rootfs is read-only.

set -e

caddy run --config /etc/caddy/Caddyfile --adapter caddyfile &

# `exec` replaces this shell so Node becomes PID 1. SIGTERM from
# `docker stop` reaches Node directly; Node's graceful shutdown handlers
# get a chance to finish in-flight uploads / downloads before the kernel
# kills the container.
exec node apps/api/build/server.js
