# @itsweber-send/crypto-spec

Specification of the cryptographic format used by ITSWEBER Send. This document is the authoritative reference for both the client implementation in `apps/web/src/lib/crypto/` and any external auditor or third-party client.

> **Status:** Stable. Manifest version 1 was used by all v1.0 shares. Manifest version 2 is the default for v1.1 and adds chunked AES-GCM so the protocol works for files of arbitrary size without buffering whole files in memory. v1 shares MUST stay decryptable.

## Goals and non-goals

### Goals

- The server learns nothing about file contents or filenames.
- A share is decryptable with the URL fragment alone (anyone with the link can decrypt). An optional password adds a second factor that the server cannot bypass.
- Recipients can verify integrity (authenticated encryption) and detect tampering.
- Implementation uses only the Web Crypto API — no external crypto dependency in the browser.
- Files of arbitrary size can be streamed end to end without buffering the full plaintext or ciphertext on either side.

### Non-goals

- Forward secrecy across uploads (each upload is a fresh key).
- Identity-based encryption (recipients are anonymous; the link is the capability).
- Resistance against an attacker who already has the URL fragment.

## Primitives

| Primitive                 | Choice                   | Parameters                                |
| ------------------------- | ------------------------ | ----------------------------------------- |
| Symmetric cipher          | AES-GCM                  | 256-bit key, 96-bit IV, 128-bit auth tag  |
| Key derivation (password) | PBKDF2                   | SHA-256, 200 000 iterations, 128-bit salt |
| Random source             | `crypto.getRandomValues` | All keys, IVs, salts                      |
| Encoding                  | base64url (RFC 4648 §5)  | URL fragment, headers, manifest fields    |

## Per-share keys

For each new share the client generates:

- A 256-bit `master_key` from `crypto.getRandomValues`.
- For manifest v1: one 96-bit `iv` per encrypted blob (file content) and one for the manifest.
- For manifest v2: one 96-bit `iv` per chunk (each file is a sequence of chunks) and one for the manifest.

The `master_key` is **never** sent to the server. It is placed in the URL fragment (`#k=<base64url>`), where it is read by the recipient's browser only.

If the user enables a password, the `master_key` is wrapped:

```text
salt        = random(16)
wrap_key    = PBKDF2(password, salt, 200_000, SHA-256) → 256 bits
wrapped_key = AES-GCM-encrypt(master_key, wrap_key, iv_wrap)
```

The server stores `salt`, `iv_wrap` and `wrapped_key` and serves them to the recipient. The recipient's browser asks for the password, derives `wrap_key`, unwraps `master_key` and proceeds. The server still cannot decrypt because it does not see the password.

## Manifest version 1 (legacy, v1.0)

```text
Container := Manifest || File[1..N]

Manifest  := AES-GCM(master_key, iv_manifest, JSON({
              version: 1,
              files: [{ name, size, mime, blobId, iv }, …],
              note: optional Markdown string
            }))

File[i]   := AES-GCM(master_key, iv_i, file_content_i)
```

Each file is a single AES-GCM call over the entire plaintext. The per-blob IV is stored both inside the encrypted manifest and in a sibling `<blobId>.iv` file on the server — the duplicate-on-server is a v1 wire-format artifact that v2 drops.

`name` and `mime` are inside the encrypted manifest; the server only stores opaque blobs keyed by `blobId`.

## Manifest version 2 (default, v1.1)

```jsonc
{
  "version": 2,
  "files": [
    {
      "name": "<plaintext filename>",
      "size": <plaintext size in bytes>,
      "mime": "<content-type>",
      "blobId": "blob-0001",
      "chunkSize": 16777216,                                  // plaintext bytes per chunk
      "chunks": [
        { "iv": "<base64url 12 bytes>", "cipherSize": 16777232 },
        { "iv": "<base64url 12 bytes>", "cipherSize": 16777232 },
        { "iv": "<base64url 12 bytes>", "cipherSize":  4194320 } // last chunk, smaller
      ]
    }
  ],
  "note": "optional markdown"
}
```

### Chunk encoding

Each chunk `i` of file `f` is computed as:

```text
ciphertext_i = AES-GCM-encrypt(master_key, chunks[i].iv, plaintext_i)
chunks[i].cipherSize = len(plaintext_i) + 16   // GCM auth tag
```

The on-server blob is the concatenation of all chunks in order, with no separators:

```text
blob-NNNN := ciphertext_1 || ciphertext_2 || … || ciphertext_C
```

The decoder walks the manifest in order, reads `chunks[i].cipherSize` bytes from the blob stream, decrypts with `(master_key, chunks[i].iv)`, emits `len - 16` bytes of plaintext. Any GCM auth-tag failure aborts the download and the recipient is shown an integrity error.

### IV generation

`chunks[i].iv` and `iv_manifest` are sampled independently from `crypto.getRandomValues` (96 bits each). At a fresh per-share `master_key` the IV-collision risk is negligible for any realistic chunk count (≤ 2³² IVs under a single key keeps the GCM birthday bound well below cryptographic concern).

### Required ordering

- The encryptor MUST process chunks in ascending order, write each ciphertext to the upload stream as soon as it is ready, and commit the manifest only after the last chunk has been acknowledged by the server.
- The decryptor MUST process chunks in ascending order. Random-access reads of a single chunk are permitted (Range requests target the byte offset computed from `Σ chunks[<i].cipherSize`), but the GCM auth tag of every chunk that is exposed to the user MUST be verified before its plaintext is delivered.

### Wire layout on storage

```text
<share-id>/
  manifest          ← AES-GCM ciphertext of manifest JSON
  manifest.iv       ← 12 bytes
  blob-0001         ← concatenated ciphertext chunks (no separators)
  blob-0002
  …
  meta.json         ← unencrypted metadata, see below
```

v2 does not write per-blob `.iv` files. IVs live in the encrypted manifest where the server cannot see them.

## meta.json (unencrypted, both versions)

```jsonc
{
  "createdAt": "2026-05-02T12:00:00.000Z",
  "expiresAt": "2026-05-09T12:00:00.000Z",
  "downloadLimit": 5,
  "passwordRequired": false,
  "salt": "<base64url, present iff passwordRequired>",
  "ivWrap": "<base64url, present iff passwordRequired>",
  "wrappedKey": "<base64url, present iff passwordRequired>",
  "manifestVersion": 2, // present from v1.1 onward; v1 shares omit it (=> implicit version 1)
}
```

`meta.json` is the only unencrypted artifact and contains no plaintext file information. The recipient client reads it first, picks the v1 or v2 decoder based on `manifestVersion`, and then fetches and decrypts the manifest.

## Sharing handoff

The recipient receives a URL of the shape:

```text
https://<host>/d/<share-id>#k=<base64url-master-key>
```

If a four-word handoff code was generated, the server stores a separate `code → share-id` mapping (with rate limit and short TTL) so the recipient can type four words instead of pasting the URL. The `master_key` still has to be transmitted — typically the URL fragment is shown alongside the four words, or the four words map to a short-lived link that ends in the fragment.

## Versioning

The `version` field inside the encrypted manifest signals the format version. Implementations MUST refuse to decrypt unknown versions. The `manifestVersion` field in the unencrypted `meta.json` allows the recipient to choose the right decoder before the manifest is downloaded; if the two disagree the manifest's `version` is authoritative and the download MUST be aborted as a tamper indication.

## Security considerations

- **Per-chunk authentication.** Every chunk carries its own GCM auth tag. A truncation attack — server returns fewer chunks than the manifest declares — is detected by the recipient because the manifest declares `chunks.length` and the recipient verifies that all declared chunks were received and authenticated before delivering the file.
- **Reordering attack.** Each chunk is encrypted with a unique IV bound to its position in the manifest. Swapping two chunks during transmission produces an auth-tag failure on the first chunk reached because the IV does not match the ciphertext.
- **Cross-share IV reuse.** Each share has a fresh `master_key`, so IVs sampled within one share are never used under another key. Cross-share IV repetition is therefore not a concern.
- **Password brute force.** PBKDF2-SHA-256 with 200 000 iterations is the OWASP 2026 floor for password-derived keys. Future versions may move to Argon2id once it is available natively in Web Crypto.
