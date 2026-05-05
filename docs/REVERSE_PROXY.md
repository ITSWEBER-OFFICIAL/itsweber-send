# Behind a reverse proxy

ITSWEBER Send ships an embedded Caddy that terminates HTTPS on port 8443
with a self-signed certificate by default — that mode is meant for direct
LAN access and gives you a working Web Crypto context without external
dependencies. When you already run a reverse proxy with a public
certificate (Nginx Proxy Manager, Traefik, an external Caddy, an Ingress
controller, …), you do **not** want a second TLS layer in the way. Set
the environment variable below and the embedded Caddy stays out of your
path.

## The switch

Set `REVERSE_PROXY_MODE=true` on the container. Two things change:

1. The embedded Caddy is **not** started.
2. Node binds `0.0.0.0:3000` instead of loopback, so the upstream proxy
   can reach it across the Docker network or LAN.

Forward your public hostname to the container's port `3000` over plain
HTTP. The reverse proxy keeps doing what it already does for every other
service it manages.

## What you must set

| Variable             | Value                                        | Why                                                 |
| -------------------- | -------------------------------------------- | --------------------------------------------------- |
| `REVERSE_PROXY_MODE` | `true`                                       | disables embedded Caddy, binds Node on 0.0.0.0:3000 |
| `ORIGIN`             | `https://send.example.com` (your public URL) | host used in generated share links + cookie scope   |
| `BASE_URL`           | same as `ORIGIN`                             | base URL embedded in HTML for the SvelteKit client  |

A `docker-compose.proxy.yml` is shipped as a starting point. It runs only
the send container and exposes `3000:3000`.

## Nginx Proxy Manager

In the _Proxy Hosts_ tab create a new entry:

- **Domain Names:** `send.example.com`
- **Scheme:** `http`
- **Forward Hostname / IP:** the docker host or container IP
- **Forward Port:** `3000`
- **Websockets Support:** on
- **Block Common Exploits:** on

In the _SSL_ tab pick or request a Let's Encrypt certificate for the
domain. Force SSL on. HSTS optional but recommended once you are sure
the public URL is final.

The _Advanced_ tab can stay empty — there is no self-signed upstream to
trust now that `REVERSE_PROXY_MODE=true` is on. Resumable uploads stream
chunks of ~16 MiB and downloads stream the encrypted blob, both well
under the default NPM body limit, so no `client_max_body_size` override
is needed unless you raise `MAX_BLOB_BYTES` past 100 GB.

## Traefik

Labels for the send container, assuming Traefik watches the `web` network
and a `cert-resolver` named `letsencrypt`:

```yaml
services:
  send:
    image: ghcr.io/itsweber-official/itsweber-send:latest
    environment:
      REVERSE_PROXY_MODE: 'true'
      ORIGIN: https://send.example.com
      BASE_URL: https://send.example.com
    networks:
      - web
    labels:
      - traefik.enable=true
      - traefik.http.routers.send.rule=Host(`send.example.com`)
      - traefik.http.routers.send.entrypoints=websecure
      - traefik.http.routers.send.tls.certresolver=letsencrypt
      - traefik.http.services.send.loadbalancer.server.port=3000
```

## External Caddy

```caddy
send.example.com {
    encode zstd gzip
    request_body { max_size 64GB }
    reverse_proxy send:3000 {
        header_up X-Real-IP {remote_host}
    }
    header {
        Strict-Transport-Security "max-age=63072000; includeSubDomains; preload"
        X-Content-Type-Options "nosniff"
        X-Frame-Options "DENY"
        Referrer-Policy "no-referrer"
        -Server
        -X-Powered-By
    }
}
```

This is the same configuration as `docker/Caddyfile.example` and pairs
with `docker-compose.yml` (the bundled production setup with an external
Caddy container).

## Nginx (vanilla)

```nginx
server {
    listen 443 ssl http2;
    server_name send.example.com;

    ssl_certificate     /etc/letsencrypt/live/send.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/send.example.com/privkey.pem;

    client_max_body_size 64G;

    location / {
        proxy_pass http://send:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_request_buffering off;
        proxy_buffering off;
    }
}
```

`proxy_request_buffering off` keeps resumable upload chunks streaming
through Nginx instead of buffering each chunk to disk before forwarding.

## Health check

Whichever proxy you use, the container's healthcheck stays internal:
`GET http://127.0.0.1:3000/health` runs inside the container regardless of
the mode. From the proxy you can additionally probe
`https://send.example.com/health` to verify the public path.

## What does NOT work

- **Embedded Caddy + external proxy at the same time.** If you forget
  `REVERSE_PROXY_MODE=true` and forward to port 8443 instead, the upstream
  hits a self-signed certificate and most proxies refuse it by default.
  Setting `proxy_ssl_verify off` works but adds an unnecessary TLS layer.
  Use `REVERSE_PROXY_MODE=true` instead.
- **Mapping port 8443 in proxy mode.** With `REVERSE_PROXY_MODE=true` no
  process listens on 8443 inside the container — the port stays open in
  the Dockerfile only because the all-in-one mode uses it.
