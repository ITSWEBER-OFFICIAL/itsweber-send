# Large file uploads (>5 GB)

ITSWEBER Send v1.1 supports files larger than 5 GB end to end. The architecture targets tens of GB; the practical ceiling on any deployment is the lowest of the per-layer limits documented below.

## How v1.1 streams uploads

Files are split into 16 MiB plaintext chunks in the browser, each encrypted with its own AES-GCM IV (manifest v2). The browser sends one chunk per HTTP `PATCH` to `/api/v1/uploads/:uploadId/blobs/:blobIndex/chunks/:chunkIndex`. The server appends each chunk to disk via `fs.createWriteStream(path, { flags: 'a' })`. Neither side ever holds the full plaintext, the full ciphertext, or the full upload body in memory.

Pause and resume are first-class: pressing pause halts the chunk loop after the in-flight `PATCH` finishes. Resume continues from the next chunk. Browser tab closes lose only the in-progress chunk; the next session can `GET /api/v1/uploads/:uploadId` to learn what the server already accepted and skip ahead — provided the user re-supplies the same files and the resume window has not lapsed.

## Per-layer limits

| Layer                          | Setting                     | v1.1 default                                                                   | What raising it does                                                                                                                                                                                          |
| ------------------------------ | --------------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Browser File System Access API | `showSaveFilePicker`        | required for streaming-to-disk ZIP downloads of multi-file shares              | Chromium streams the ZIP directly to disk. Safari and Firefox lack the API; the "Download all as ZIP" button is hidden there and per-file downloads stay available.                                           |
| Caddy reverse proxy            | `request_body { max_size }` | `64GB` (`docker/Caddyfile.example`)                                            | Bounds the largest single HTTP request body. With the resumable path, this only matters for the legacy single-shot `/api/v1/upload` (manifest v1, ≤500 MB) and for the finalize call (small — manifest only). |
| Fastify resumable PATCH        | per-route `bodyLimit`       | `chunkSize + 4 KiB` slack                                                      | Bounds one chunk; not the whole upload.                                                                                                                                                                       |
| Fastify legacy `/upload`       | multipart `fileSize`        | 500 MB                                                                         | Old single-shot path; new clients use the resumable path and are not gated by this.                                                                                                                           |
| Server `MAX_BLOB_BYTES`        | env var                     | `100 GB` per file                                                              | Hard server-side ceiling per single file. Tune upward for media-archive use cases.                                                                                                                            |
| Server `CHUNK_SIZE_BYTES`      | env var                     | `16 MiB`                                                                       | Larger chunks → fewer round-trips, more RAM per chunk encrypt. Lower → more round-trips, smaller per-request memory.                                                                                          |
| S3 multipart minimum part size | (S3 protocol)               | 5 MiB                                                                          | At default chunk size (16 MiB) we satisfy this. If you lower `CHUNK_SIZE_BYTES` below 5 MiB the S3 backend will reject all parts except the last.                                                             |
| S3 multipart max parts         | (S3 protocol)               | 10 000                                                                         | At default chunk size the S3-backed per-blob ceiling is ~156 GB. Raise `CHUNK_SIZE_BYTES` for larger files on S3. The filesystem backend has no part-count cap.                                               |
| Docker tmpfs `/tmp`            | `tmpfs size`                | 64 MiB                                                                         | Uploads do _not_ spool through `/tmp`. This is sized for short-lived per-process scratch only.                                                                                                                |
| Container disk / volume        | physical                    | bound by the host                                                              | The on-disk encrypted blob lives under `STORAGE_PATH` (default `/data/uploads`). Make sure the volume has at least 2× the largest expected total share size to leave headroom for cleanup.                    |

## S3 backend

The S3 adapter supports both range-aware streaming downloads and resumable chunked uploads (S3 multipart). Each blob in a share maps to one S3 multipart upload; `chunkIndex` becomes `PartNumber = chunkIndex + 1`, and the upload commits via `CompleteMultipartUploadCommand` during finalize. The adapter persists no extra state in the application database — S3 itself is the source of truth for in-flight uploads, so a process restart mid-upload transparently resumes via `ListMultipartUploads` + `ListParts`.

Per-blob ceiling on S3 is `10 000 × CHUNK_SIZE_BYTES` (≈156 GB at the default 16 MiB chunk size). Boot-time validation refuses `STORAGE_BACKEND=s3` with `CHUNK_SIZE_BYTES < 5 MiB` (S3 multipart minimum part size) and warns when `MAX_BLOB_BYTES` exceeds the per-blob ceiling. The filesystem backend has no part-count cap.

To run the S3 multipart integration tests against a local MinIO container:

```bash
docker run --rm -d --name minio-test -p 9000:9000 \
  -e MINIO_ROOT_USER=minioadmin -e MINIO_ROOT_PASSWORD=minioadmin \
  minio/minio server /data
S3_TEST_ENDPOINT=http://127.0.0.1:9000 S3_TEST_BUCKET=itsweber-send-test \
  AWS_ACCESS_KEY_ID=minioadmin AWS_SECRET_ACCESS_KEY=minioadmin \
  pnpm --filter @itsweber-send/api test
```

Without `S3_TEST_ENDPOINT` set the multipart suite is skipped, so the default `pnpm test` run on a developer machine without MinIO stays green.

## Verifying a large-file deployment

After raising any of the above for a large-file workload:

1. `pnpm test` and `pnpm test:e2e` from the repo root.
2. From the production host: `curl -fsS https://send.example.com/health`.
3. Anonymous upload of a 6 GB synthetic file with `dd if=/dev/urandom of=/tmp/test.bin bs=1M count=6144` and the web UI; verify the share URL works on a different device.
4. While the upload runs at ~50 % progress, click pause, close the browser tab, reopen the same session, and verify the upload picks up where it left off (within the resume window).
5. Multi-file share with one >5 GB file plus a few small files; verify all decrypt to byte-identical originals.
