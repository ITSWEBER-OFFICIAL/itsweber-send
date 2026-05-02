# Accounts &amp; Two-Factor Authentication

> [Deutsch](de/11-konto-und-2fa.md)

Accounts are optional. Anonymous uploads work without registration. Creating an account adds upload history, quota, API tokens, audit log and 2FA.

---

## Registration &amp; first admin

The first user to register on a fresh deployment automatically receives the `admin` role. After that, the admin can:

- Toggle `REGISTRATION_ENABLED` to lock account creation
- Promote or demote users via the admin panel
- See system-wide audit logs

To lock down the deployment after onboarding the admin: set `REGISTRATION_ENABLED=false` and restart.

---

## Account pages

Once logged in, the **Konto** menu has nine sub-pages:

| Page                 | What you do there                            |
| -------------------- | -------------------------------------------- |
| `Übersicht`          | Quota usage, recent shares, quick actions    |
| `Uploads`            | Full list of your shares; delete or inspect  |
| `API-Tokens`         | Create, list, revoke API tokens (see below)  |
| `Profil`             | Display name, email                          |
| `Sicherheit`         | Change password, set up 2FA                  |
| `Benachrichtigungen` | Email notifications on download / expiry     |
| `Sprache`            | UI language preference                       |
| `Theme`              | Light / dark / system                        |
| `Audit-Log`          | All actions on your account, with timestamps |

---

## API tokens

Tokens authenticate machine-to-machine API calls without a session cookie.

### Create

`Konto -> API-Tokens -> Neuer Token`. Give the token a name (e.g. `CI-Pipeline`) and an optional expiry date. The token is shown **once** — copy it immediately. After dismissing, only the name and metadata remain visible.

### Use

Pass the token in the `Authorization` header:

```bash
curl -H "Authorization: Bearer <token>" \
     -F meta='...' \
     -F manifest=@manifest.bin \
     -F blob-0001=@blob1.bin \
     https://send.example.com/api/v1/upload
```

### Revoke

`Konto -> API-Tokens` -> trash icon next to the token. The change is immediate; any client still using the token gets `401 Unauthorized`.

### Scope

A token inherits the role of the user that created it. Admin tokens can call admin endpoints; user tokens cannot. Tokens count against the same quota as the user. Audit-log entries record `auth.method = token` so token usage is traceable.

---

## Two-factor authentication (TOTP)

ITSWEBER Send implements RFC 6238 TOTP with HMAC-SHA1 and a 30-second window. No external dependencies.

### Setup

1. `Konto -> Sicherheit -> 2FA aktivieren`
2. The page shows a QR code and a Base32 secret
3. Scan the QR code with an authenticator app (Aegis, 1Password, Authy, Google Authenticator, ...) or paste the Base32 secret manually
4. Enter the current 6-digit code -> the server verifies and enables 2FA for the account

### Login flow with 2FA

1. POST `/api/v1/auth/login` with email + password
2. Server returns `202 { requires2FA: true }`
3. The login page now shows a 6-digit input
4. POST `/api/v1/auth/login` again with email + password + `totpCode`
5. On success: `200` and the `sid` cookie is set

A clock-skew window of ±1 step (±30 s) is accepted. If the user's clock drifts further, codes will fail — the user can disable 2FA from the security page if they still have a session, otherwise the admin needs to reset the field.

### Disable

`Konto -> Sicherheit -> 2FA deaktivieren`. Requires re-authentication via password. Cleans `totp_secret` from the database.

### Recovery

There are no recovery codes in v1.0. If you lose the authenticator and the active session, an admin must clear `users.totp_enabled` and `users.totp_secret` for the affected user via SQLite. Recovery codes are on the v1.1 roadmap.
