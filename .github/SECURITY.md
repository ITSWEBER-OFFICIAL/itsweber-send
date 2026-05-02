# Security

## Reporting a vulnerability

Please **do not** open a public GitHub issue for security problems. Instead, use GitHub's private vulnerability reporting:

1. Go to the repository's **Security** tab.
2. Click **Report a vulnerability**.
3. Provide a clear description, reproduction steps and the affected version.

We aim to acknowledge reports within 72 hours and to ship a fix within 14 days for high-severity issues. After a fix is released, we will credit you in the changelog if you wish.

## Scope

Issues that are in scope:

- Authentication and session handling
- Cryptographic implementation (file encryption, key derivation, nonce reuse)
- Server-side request forgery, path traversal, injection
- Container escape, sandbox bypass
- Denial of service that affects availability for other users

Issues that are typically out of scope:

- Findings only reproducible against unsupported configurations
- Self-XSS that requires the user to paste arbitrary content into devtools
- Reports from automated scanners without a working proof of concept
- Missing best-practice headers that are not exploitable
