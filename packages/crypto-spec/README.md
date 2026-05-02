# @itsweber-send/crypto-spec

Specification of the cryptographic format used by ITSWEBER Send. This document is the authoritative reference for both the client implementation in `apps/web/src/lib/crypto/` and any external auditor or third-party client.

> **Status:** Draft. Will be frozen at v1.0 of the project. Until then, breaking changes may happen and will be noted here with a version bump.

## Goals and non-goals

**Goals**

- The server learns nothing about file contents or filenames.
- A share is decryptable with the URL fragment alone (anyone with the link can decrypt). An optional password adds a second factor that the server cannot bypass.
- Recipients can verify integrity (authenticated encryption) and detect tampering.
- Implementation uses only the Web Crypto API — no external crypto dependency in the browser.

**Non-goals**

- Forward secrecy across uploads (each upload is a fresh key).
- Identity-based encryption (recipients are anonymous; the link is the capability).
- Resistance against an attacker who already has the URL fragment.

## Primitives

| Primitive | Choice | Parameters |
| --- | --- | --- |
| Symmetric cipher | AES-GCM | 256-bit key, 96-bit IV, 128-bit auth tag |
| Key derivation (password) | PBKDF2 | SHA-256, 200 000 iterations, 128-bit salt |
| Random source | `crypto.getRandomValues` | All keys, IVs, salts |
| Encoding | base64url (RFC 4648 §5) | URL fragment, headers |

## Per-share keys

For each new share the client generates:

- A 256-bit `master_key` from `crypto.getRandomValues`.
- A unique 96-bit `iv` per encrypted blob (file content, manifest).

The `master_key` is **never** sent to the server. It is placed in the URL fragment (`#k=<base64url>`), where it is read by the recipient's browser only.

If the user enables a password, the `master_key` is wrapped:

```
salt        = random(16)
wrap_key    = PBKDF2(password, salt, 200_000, SHA-256) → 256 bits
wrapped_key = AES-GCM-encrypt(master_key, wrap_key, iv_wrap)
```

The server stores `salt`, `iv_wrap` and `wrapped_key` and serves them to the recipient. The recipient's browser asks for the password, derives `wrap_key`, unwraps `master_key` and proceeds. The server still cannot decrypt because it does not see the password.

## Share container

Each share is a tar-like container of encrypted blobs plus an encrypted manifest:

```
Container := Manifest || File[1..N]

Manifest  := AES-GCM(master_key, iv_manifest, JSON({
              version: 1,
              files: [{ name, size, mime, blobId, iv }, …],
              note: optional Markdown string
            }))

File[i]   := AES-GCM(master_key, iv_i, file_content_i)
```

`name` and `mime` are inside the encrypted manifest; the server only stores opaque blobs keyed by `blobId`.

## Wire format

A share has the following directory layout on the server:

```
<share-id>/
  manifest          ← bytes of AES-GCM ciphertext
  manifest.iv       ← 12 bytes, base64url
  blob-0001         ← AES-GCM ciphertext of file 1
  blob-0001.iv
  blob-0002
  blob-0002.iv
  …
  meta.json         ← unencrypted: createdAt, expiresAt, downloadLimit, salt, iv_wrap, wrapped_key
```

`meta.json` is the only unencrypted artifact and contains no plaintext file information.

## Sharing handoff

The recipient receives a URL of the shape:

```
https://<host>/d/<share-id>#k=<base64url-master-key>
```

If a four-word handoff code was generated, the server stores a separate `code → share-id` mapping (with rate limit and short TTL) so the recipient can type four words instead of pasting the URL. The `master_key` still has to be transmitted somehow (typically the URL fragment is shown alongside the four words, or the four words map to a short-lived link that ends in the fragment).

## Versioning

The `version` field inside the encrypted manifest signals the format version. Implementations MUST refuse to decrypt unknown versions.
