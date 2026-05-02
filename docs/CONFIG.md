# Configuration Reference

All configuration is done via environment variables. No configuration file is required; the defaults are suitable for local development. In production, set at least `BASE_URL` and `NODE_ENV=production`.

---

## Server

| Variable | Default | Description |
|---|---|---|
| `NODE_ENV` | `development` | Set to `production` for production deployments. Enables HTTPS-only cookies, disables dev-mode CORS, and enables the `upgrade-insecure-requests` CSP directive. |
| `HOST` | `127.0.0.1` | Interface the Fastify server binds to. Set to `0.0.0.0` when running inside a container without a reverse proxy on the same host. |
| `PORT` | `3000` | TCP port the application listens on. |
| `BASE_URL` | `http://localhost:3000` | Publicly reachable URL of the service, including scheme and optional port. Used to construct share links and cookie attributes. Must not end with a slash. |
| `LOG_LEVEL` | `info` | Pino log level: `fatal`, `error`, `warn`, `info`, `debug`, `trace`. |

---

## Storage

| Variable | Default | Description |
|---|---|---|
| `STORAGE_BACKEND` | `filesystem` | Storage adapter for uploaded blobs. `filesystem` stores blobs as files on disk. `s3` is available as a plugin (v1.1+). |
| `STORAGE_PATH` | `./data/uploads` | Root directory for the filesystem storage backend. Must be writable by the process. In the container, this maps to `/data/uploads` inside the persistent volume. |
| `DB_PATH` | `./data/shares.db` | Path to the SQLite database file. Must be writable. |

---

## Rate limiting

| Variable | Default | Description |
|---|---|---|
| `RATE_LIMIT_PER_MIN` | `60` | Global per-IP request limit per minute. Applies to all routes except `/health` and `/ready`. Per-route limits for login (5 / min) and registration (3 / 10 min) are separate and stricter. |

---

## Accounts

| Variable | Default | Description |
|---|---|---|
| `ENABLE_ACCOUNTS` | `true` | Allow user registration and login. When set to `false`, the auth routes return 404 and uploads are always anonymous. |
| `REGISTRATION_ENABLED` | `true` | Allow new account registrations. Set to `false` to lock account creation after the initial admin is set up. |
| `SESSION_EXPIRY_DAYS` | `30` | Lifetime of a session cookie in days. After expiry the user must log in again. |
| `DEFAULT_QUOTA_BYTES` | `5368709120` | Per-user upload quota in bytes. Default: 5 GB. Applies to new accounts; existing accounts retain their quota at registration time. |

---

## Example `.env`

```dotenv
NODE_ENV=production
BASE_URL=https://send.example.com
LOG_LEVEL=info

STORAGE_BACKEND=filesystem
STORAGE_PATH=/data/uploads
DB_PATH=/data/shares.db

RATE_LIMIT_PER_MIN=60

ENABLE_ACCOUNTS=true
REGISTRATION_ENABLED=true
SESSION_EXPIRY_DAYS=30
DEFAULT_QUOTA_BYTES=5368709120
```

Pass this file to `docker compose`:

```bash
docker compose --env-file .env up -d
```

---

## Notes

- The `MAX_FILE_SIZE_MB` cap (default: 5 GB) is enforced at the multipart parser level in the API and at the reverse proxy level in the Caddyfile. To raise it, update both.
- All secrets (session tokens, encryption keys) are generated at runtime using `crypto.getRandomValues` or Node's `crypto.randomBytes`. No secret configuration key is required.
- The first user to register receives the `admin` role automatically, regardless of email address.
