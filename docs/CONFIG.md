# Configuration Reference

All configuration is done via environment variables. No configuration file is required; the defaults are suitable for local development. In production, set at least `BASE_URL` and `NODE_ENV=production`.

---

## Server

| Variable    | Default                 | Description                                                                                                                                                    |
| ----------- | ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `NODE_ENV`  | `development`           | Set to `production` for production deployments. Enables HTTPS-only cookies, disables dev-mode CORS, and enables the `upgrade-insecure-requests` CSP directive. |
| `HOST`      | `127.0.0.1`             | Interface the Fastify server binds to. Set to `0.0.0.0` when running inside a container without a reverse proxy on the same host.                              |
| `PORT`      | `3000`                  | TCP port the application listens on.                                                                                                                           |
| `BASE_URL`  | `http://localhost:3000` | Publicly reachable URL of the service, including scheme and optional port. Used to construct share links and cookie attributes. Must not end with a slash.     |
| `LOG_LEVEL` | `info`                  | Pino log level: `fatal`, `error`, `warn`, `info`, `debug`, `trace`.                                                                                            |

---

## Storage

| Variable          | Default            | Description                                                                                                                                                      |
| ----------------- | ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `STORAGE_BACKEND` | `filesystem`       | Storage adapter for uploaded blobs. `filesystem` stores blobs as files on disk. `s3` is available as a plugin (v1.1+).                                           |
| `STORAGE_PATH`    | `./data/uploads`   | Root directory for the filesystem storage backend. Must be writable by the process. In the container, this maps to `/data/uploads` inside the persistent volume. |
| `DB_PATH`         | `./data/shares.db` | Path to the SQLite database file. Must be writable.                                                                                                              |

---

## Rate limiting

| Variable             | Default | Description                                                                                                                                                                                |
| -------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `RATE_LIMIT_PER_MIN` | `60`    | Global per-IP request limit per minute. Applies to all routes except `/health` and `/ready`. Per-route limits for login (5 / min) and registration (3 / 10 min) are separate and stricter. |

---

## Accounts

| Variable               | Default      | Description                                                                                                                                                                                                                                 |
| ---------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ENABLE_ACCOUNTS`      | `true`       | Boot-time hard kill-switch for the auth subsystem. When `false`, the auth routes return 404 and uploads are always anonymous. Cannot be changed at runtime.                                                                                 |
| `REGISTRATION_ENABLED` | `true`       | Boot default for self-service registration. The matching admin setting (`registration_enabled` in `system_settings`) takes precedence at runtime once set.                                                                                  |
| `SESSION_EXPIRY_DAYS`  | `30`         | Lifetime of a session cookie in days. After expiry the user must log in again.                                                                                                                                                              |
| `DEFAULT_QUOTA_BYTES`  | `5368709120` | Boot default for per-user upload quota in bytes (5 GB). Admin override `default_quota_bytes` in `system_settings` takes precedence at runtime once set. Applies to new accounts; existing accounts retain their quota at registration time. |

---

## Uploads

| Variable              | Default                 | Description                                                                                                                                                                                                                                                    |
| --------------------- | ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CHUNK_SIZE_BYTES`    | `16777216` (16 MiB)     | Plaintext bytes per chunk in the resumable upload path. On `STORAGE_BACKEND=s3` this MUST be at least 5 MiB (S3 multipart minimum part size); the server refuses to start otherwise.                                                                           |
| `MAX_BLOB_BYTES`      | `107374182400` (100 GB) | Hard server-side ceiling per single file. Non-overridable upper bound — the admin-tunable `max_upload_size_bytes` setting can lower the effective ceiling at runtime but cannot raise it past this value. Increasing this is the way to support 100 GB+ files. |
| `UPLOAD_RESUME_HOURS` | `24`                    | Lifetime of a pending resumable upload before the cleanup job removes it and frees its partial blobs.                                                                                                                                                          |

---

## Runtime-tunable admin settings

These four values can be changed by an admin through the admin UI without restarting the container; the server reads them on every request. Each falls back to the matching environment variable when no admin override has been set yet, so a fresh container starts with the env defaults.

| Setting key (in `system_settings`) | Env fallback           | Effect                                                                                                                                                                                                                                                                                                   |
| ---------------------------------- | ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `registration_enabled`             | `REGISTRATION_ENABLED` | Soft-toggles self-service registration. The boot-time `ENABLE_ACCOUNTS=false` kill-switch overrides this — both must be `true` for new accounts to be created.                                                                                                                                           |
| `default_quota_bytes`              | `DEFAULT_QUOTA_BYTES`  | Quota assigned to a freshly-registered user. Existing users keep the quota they were registered with.                                                                                                                                                                                                    |
| `max_upload_size_bytes`            | `MAX_BLOB_BYTES`       | Effective ceiling on the ciphertext size of one file (one blob). Clamped to `min(env.MAX_BLOB_BYTES, admin_value)` — admin can lower it at runtime but cannot raise it past `MAX_BLOB_BYTES`. Applies to NEW uploads only; in-progress uploads finish under the value that was in effect at create time. |
| `max_expiry_hours`                 | `168` (7 days)         | Maximum `expiryHours` a sender can pick on a new share. Validated server-side after the shared schema's preset check.                                                                                                                                                                                    |

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

## S3 / MinIO storage

| Variable                | Default                                | Description                                                                                                    |
| ----------------------- | -------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `S3_BUCKET`             | _(required when `STORAGE_BACKEND=s3`)_ | Name of the S3 bucket or MinIO bucket for blob storage.                                                        |
| `S3_ENDPOINT`           | _(empty)_                              | Custom endpoint URL for MinIO or other S3-compatible services (e.g. `http://minio:9000`). Leave empty for AWS. |
| `S3_REGION`             | `us-east-1`                            | AWS region or MinIO region.                                                                                    |
| `S3_FORCE_PATH_STYLE`   | `false`                                | Set to `true` when using MinIO or other path-style S3 implementations.                                         |
| `AWS_ACCESS_KEY_ID`     | _(from environment)_                   | S3 / MinIO access key. The AWS SDK reads this standard env var automatically.                                  |
| `AWS_SECRET_ACCESS_KEY` | _(from environment)_                   | S3 / MinIO secret key.                                                                                         |

---

## Webhooks

| Variable         | Default   | Description                                                                                                         |
| ---------------- | --------- | ------------------------------------------------------------------------------------------------------------------- |
| `WEBHOOK_URL`    | _(empty)_ | HTTP(S) endpoint to POST webhook events to. Leave empty to disable.                                                 |
| `WEBHOOK_SECRET` | _(empty)_ | Optional HMAC-SHA256 signing secret. When set, each request includes an `X-Webhook-Signature: sha256=<hex>` header. |

---

## SMTP (notify on first download)

Authenticated senders can opt-in to receive an email when their share is downloaded for the first time. The mailer is fully optional: leave `SMTP_HOST` unset and the feature is disabled silently — uploads still succeed and the UI surfaces a "log in to enable" hint.

| Variable      | Default                | Description                                                                                            |
| ------------- | ---------------------- | ------------------------------------------------------------------------------------------------------ |
| `SMTP_HOST`   | _(empty)_              | Hostname of the SMTP relay. Leave empty to disable the notification feature entirely.                  |
| `SMTP_PORT`   | `587`                  | TCP port. Use `587` for STARTTLS (default) or `465` together with `SMTP_SECURE=true` for implicit TLS. |
| `SMTP_SECURE` | `false`                | `true` enables implicit TLS (port 465). Leave `false` for STARTTLS on port 587.                        |
| `SMTP_USER`   | _(empty)_              | Auth username. Skip together with `SMTP_PASS` when the relay accepts unauthenticated submissions.      |
| `SMTP_PASS`   | _(empty)_              | Auth password or app token.                                                                            |
| `SMTP_FROM`   | _(falls back to USER)_ | `From:` header value. A name-and-address form like `ITSWEBER Send <noreply@example.com>` is supported. |

The notification fires exactly once per share, on the first successful (non-Range) read of the last blob. SMTP errors are logged but never block the download response — recipients always get the file even if the email send fails.

Webhook events:

- `upload.created` — fires after a share is stored
- `download.completed` — fires after a blob is downloaded

Each request body is a JSON object with an added `timestamp` field (ISO 8601). Delivery is attempted once with a single retry on failure. The application does not block the HTTP response on webhook delivery.

---

## Notes

- The per-file size cap is controlled by `MAX_BLOB_BYTES` (default 100 GB) and the admin-tunable `max_upload_size_bytes` runtime setting. For the legacy single-shot upload route the multipart parser enforces a separate 500 MB ceiling. The Caddyfile `request_body { max_size }` provides the reverse-proxy layer (default 64 GB in the provided example).
- All secrets (session tokens, encryption keys) are generated at runtime using `crypto.getRandomValues` or Node's `crypto.randomBytes`. No secret configuration key is required.
- The first user to register receives the `admin` role automatically, regardless of email address.
