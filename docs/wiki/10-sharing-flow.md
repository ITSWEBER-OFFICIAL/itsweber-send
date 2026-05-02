# Sharing Flow

> [Deutsch](de/10-sharing-flow.md)

This page explains exactly what happens when you upload a file and how the three sharing methods relate to each other.

---

## End-to-end model

1. The browser generates a 256-bit `master_key` with `crypto.getRandomValues`.
2. Each file blob is encrypted separately with **AES-256-GCM** (96-bit IV, 128-bit auth tag).
3. The manifest (filenames, sizes, MIME types) is encrypted with the same key.
4. All ciphertext is uploaded. The server stores opaque blobs and never sees the key or filenames.
5. The browser produces three artefacts the recipient can use:

| Artefact                           | Carries the key?   | Notes                                                 |
| ---------------------------------- | ------------------ | ----------------------------------------------------- |
| **Sharing-Link** (URL with `#k=…`) | Yes                | Self-contained. Fragment is never sent to the server. |
| **Four-word code**                 | No (only ~32 bits) | Lookup token. Resolves to the share ID via SHA-256.   |
| **Password** (optional)            | Derived            | PBKDF2-SHA-256 wraps the key client-side.             |

The relevant invariant: **any artefact that decrypts must carry the key, directly or indirectly.** A 4-word code alone cannot.

---

## Three sharing modes

### Mode 1 — Full link

You send the long URL (`https://host/d/<id>#k=<base64url>`). The recipient pastes it into the address bar; the browser decrypts in place.

Use this for: chat, email, anywhere that preserves the URL exactly.

### Mode 2 — Voice / dictation (recommended for phone calls)

Enable both **Passwort** and **4-Wort-Code** during upload. The result panel groups them in a "Per Sprache teilen" box. You dictate:

```
Code:     messer-asche-sahne-buch
Passwort: Sonne42
```

The recipient opens the **Empfangen** page, types the code, and is redirected to the download page. Because a password is set, it shows a password prompt — the recipient enters `Sonne42` and the share decrypts.

This mode is fully voice-shareable. It is the only way to use the four-word code as a stand-alone capability.

### Mode 3 — Code as lookup, link as decryption

Enable the four-word code but no password. The result panel labels the code as "nur Lookup". You send the code through one channel (chat) and the full link through another (signal). Recipients can use either: the code finds the share, the link decrypts it. The code is then a memory-aid, not a separate capability.

---

## Receive flow

The **Empfangen** page accepts:

1. A full URL with `#k=…` -> opens `/d/<id>#k=…` directly.
2. A 24-character hex share ID -> opens `/d/<id>` (recipient still needs the key).
3. A 4-word code -> calls `GET /api/v1/r/<wordcode>` to resolve the share ID, then redirects to `/d/<id>`.

If the share is password-protected, the download page shows a password prompt. The password is run through PBKDF2-SHA-256 (200 000 iterations) with the share's salt to unwrap the master key. If wrong, the prompt re-asks; the server sees only ciphertext attempts.

If the share is not password-protected and the URL has no `#k=…`, the page tells the recipient to ask the sender for the password or the full URL — the share cannot be decrypted from the share ID alone.

---

## Why four words is enough for lookup but not for decryption

Four words from a 255-word German list carries:

```
4 * log2(255) = 4 * 7.99 = ~32 bits
```

That is enough to address `2^32 = ~4 billion` possible codes — collision-resistant for any realistic deployment, but **far too few** to encode a 256-bit AES key. To encode a key, you would need:

```
ceil(256 / log2(W)) words
W = 255   ->  ~33 words
W = 2048  ->  24 words (this is what BIP-39 / hardware wallets use)
```

Anything in the 4 to 6 word range is fundamentally a lookup token, not a key. The wordcode is therefore deliberately scoped: short, memorable, dictation-friendly — paired with a password to gain decryption capability.
