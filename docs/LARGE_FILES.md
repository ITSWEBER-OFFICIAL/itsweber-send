# Large file uploads (>5 GB)

ITSWEBER Send v1.1 supports files larger than 5 GB end to end. The architecture targets tens of GB; the practical ceiling on any deployment is the lowest of the per-layer limits documented below.

## How v1.1 streams uploads

Files are split into 16 MiB plaintext chunks in the browser, each encrypted with its own AES-GCM IV (manifest v2). The browser sends one chunk per HTTP `PATCH` to `/api/v1/uploads/:uploadId/blobs/:blobIndex/chunks/:chunkIndex`. The server appends each chunk to disk via `fs.createWriteStream(path, { flags: 'a' })`. Neither side ever holds the full plaintext, the full ciphertext, or the full upload body in memory.

Pause and resume are first-class: pressing pause halts the chunk loop after the in-flight `PATCH` finishes. Resume continues from the next chunk. Browser tab closes lose only the in-progress chunk; the next session can `GET /api/v1/uploads/:uploadId` to learn what the server already accepted and skip ahead — provided the user re-supplies the same files and the resume window has not lapsed.

## Per-layer limits

| Layer                          | Setting                     | v1.1 default                                                                   | What raising it does                                                                                                                                                                                          |
| ------------------------------ | --------------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Browser File System Access API | `showSaveFilePicker`        | required for streaming-to-disk downloads above ~2 GB (Block B, next iteration) | Browsers without the API fall back to in-memory Blob downloads — practical ceiling ~2 GB depending on device.                                                                                                 |
| Caddy reverse proxy            | `request_body { max_size }` | `64GB` (`docker/Caddyfile.example`)                                            | Bounds the largest single HTTP request body. With the resumable path, this only matters for the legacy single-shot `/api/v1/upload` (manifest v1, ≤500 MB) and for the finalize call (small — manifest only). |
| Fastify resumable PATCH        | per-route `bodyLimit`       | `chunkSize + 4 KiB` slack                                                      | Bounds one chunk; not the whole upload.                                                                                                                                                                       |
| Fastify legacy `/upload`       | multipart `fileSize`        | 500 MB                                                                         | Old single-shot path; new clients use the resumable path and are not gated by this.                                                                                                                           |
| Server `MAX_BLOB_BYTES`        | env var                     | `100 GB` per file                                                              | Hard server-side ceiling per single file. Tune upward for media-archive use cases.                                                                                                                            |
| Server `CHUNK_SIZE_BYTES`      | env var                     | `16 MiB`                                                                       | Larger chunks → fewer round-trips, more RAM per chunk encrypt. Lower → more round-trips, smaller per-request memory.                                                                                          |
| S3 multipart minimum part size | (S3 protocol)               | 5 MiB                                                                          | At default chunk size (16 MiB) we satisfy this. If you lower `CHUNK_SIZE_BYTES` below 5 MiB the S3 backend will reject all parts except the last.                                                             |
| S3 multipart max parts         | (S3 protocol)               | 10 000                                                                         | At default chunk size the S3-backed per-blob ceiling is ~156 GB. Raise `CHUNK_SIZE_BYTES` for larger files on S3. The filesystem backend has no part-count cap.                                               |
| Docker tmpfs `/tmp`            | `tmpfs size`                | 64 MiB                                                                         | Uploads do _not_ spool through `/tmp`. This is sized for short-lived per-process scratch only.                                                                                                                |
| Container disk / volume        | physical                    | bound by the host                                                              | The on-disk encrypted blob lives under `STORAGE_PATH` (default `/data/uploads`). Make sure the volume has at least 2× the largest expected total share size to leave headroom for cleanup.                    |

## S3 backend caveat

The buffer-based S3 adapter that ships with v1.1 supports streaming downloads (Range-aware) but **not yet** resumable chunk uploads — `appendStream` throws an explicit error. Files up to 500 MB still work via the legacy `/api/v1/upload` route on S3 storage. Resumable chunked S3 uploads (multipart-based) are tracked for the next iteration. Use the filesystem backend for >500 MB on S3-only deployments until the multipart adapter ships.

## Verifying a large-file deployment

After raising any of the above for a large-file workload:

1. `pnpm test` and `pnpm test:e2e` from the repo root.
2. From the production host: `curl -fsS https://send.example.com/health`.
3. Anonymous upload of a 6 GB synthetic file with `dd if=/dev/urandom of=/tmp/test.bin bs=1M count=6144` and the web UI; verify the share URL works on a different device.
4. While the upload runs at ~50 % progress, click pause, close the browser tab, reopen the same session, and verify the upload picks up where it left off (within the resume window).
5. Multi-file share with one >5 GB file plus a few small files; verify all decrypt to byte-identical originals.
