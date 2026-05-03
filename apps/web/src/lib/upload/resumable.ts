/**
 * Resumable, chunk-encrypted upload driver (v1.1).
 *
 * Wire protocol: see `apps/api/src/routes/uploads-resumable.ts` and the
 * decisions doc. Crypto: manifest v2, see `packages/crypto-spec/README.md`.
 *
 * Pause/resume: the returned `ResumableUploadHandle` exposes `pause()` and
 * `resume()`. After `pause()` the driver finishes the in-flight chunk
 * PATCH and then awaits the resume signal. After a browser tab close
 * the upload can still be resumed within `UPLOAD_RESUME_HOURS` by calling
 * `resumeExistingUpload(uploadId, files, options)` — the persisted IVs
 * and the server's reported `receivedChunks` are used to skip what was
 * already accepted.
 *
 * Persistence: the driver writes a small `ResumableState` blob to
 * localStorage keyed by `uploadId` so a tab refresh has the IVs needed
 * to assemble the manifest at finalize time. The state contains no
 * key material and no plaintext — losing it just means the user has
 * to re-pick the files and start a fresh upload.
 */

import {
  generateKey,
  exportKeyBase64url,
  generateIV,
  encrypt,
  wrapMasterKey,
  importKeyBase64url,
  toBase64url,
} from '$lib/crypto/index.js';
import { planFileChunks, encryptFileChunk, type ChunkPlanFile } from '$lib/crypto/chunked.js';
import type {
  ManifestV2,
  ManifestFileV2,
  ResumableUploadCreateRequest,
  ResumableUploadCreateResponse,
  ResumableUploadState,
} from '@itsweber-send/shared';

const STORAGE_KEY_PREFIX = 'itsweber-send/upload/';

export interface ResumableUploadOptions {
  expiryHours: number;
  downloadLimit: number;
  password?: string;
  note?: string;
  /**
   * Optional address to email when the share is first downloaded. Server
   * rejects this when the request is anonymous, so callers must only set
   * it for an authenticated session.
   */
  notifyEmail?: string;
  /** Called whenever cumulative bytes-uploaded changes. */
  onProgress?: (sentBytes: number, totalBytes: number) => void;
  /** Called when a per-blob ciphertext chunk has been accepted. */
  onChunkAccepted?: (blobIndex: number, chunkIndex: number, totalChunks: number) => void;
  /**
   * Fires as soon as the driver has both an `uploadId` and the exported
   * `keyB64`. The host page uses this to write `#u=<id>&k=<keyB64>` into
   * the location hash — the only way a recipient (or the sender on a
   * different tab) can resume after a tab close, since the key never
   * touches localStorage.
   */
  onUploadIdReady?: (uploadId: string, keyB64: string) => void;
  /** Optional override; defaults to `fetch`. Tests inject a stub. */
  fetchImpl?: typeof fetch;
}

export interface ResumableUploadResult {
  id: string;
  key: string;
  expiresAt: string;
  wordcode: string | null;
}

export interface ResumableUploadHandle {
  /** Promise that resolves with the share details once finalize succeeds. */
  done: Promise<ResumableUploadResult>;
  /** Block further chunk uploads. Resolves once the in-flight PATCH finishes. */
  pause(): Promise<void>;
  /** Unblock the chunk loop. */
  resume(): void;
  /** Cancel the upload, DELETE it on the server, drop the persisted state. */
  cancel(): Promise<void>;
  /** The server-issued upload-id; useful for cross-session resume. */
  uploadId: Promise<string>;
}

interface PersistedFileState {
  blobId: string;
  cipherSize: number;
  chunkSize: number;
  chunks: { ivB64: string }[];
}

interface ResumablePersistedState {
  uploadId: string;
  shareId: string;
  expiresAt: string;
  /** master_key as exported base64url — only persisted with `keepKeyInLocalStorage`
   *  (false by default; keeps the key off disk between sessions). */
  keyB64: string | null;
  files: PersistedFileState[];
  password: { salt: string; ivWrap: string; wrappedKey: string } | null;
  noteB64: string | null;
  expiryHours: number;
  downloadLimit: number;
}

function persistedKey(uploadId: string): string {
  return STORAGE_KEY_PREFIX + uploadId;
}

export interface PendingUploadSummary {
  uploadId: string;
  shareId: string;
  expiresAt: string;
  fileCount: number;
  totalCipherBytes: number;
  passwordProtected: boolean;
}

/**
 * Enumerate all non-expired resumable uploads we still have local state
 * for. The returned summaries are safe to render — none contain key
 * material or plaintext. Stale entries (past `expiresAt`) are pruned as
 * a side effect so the homepage banner does not re-offer dead uploads.
 */
export function listPendingUploads(): PendingUploadSummary[] {
  if (typeof localStorage === 'undefined') return [];
  const out: PendingUploadSummary[] = [];
  const now = Date.now();
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key || !key.startsWith(STORAGE_KEY_PREFIX)) continue;
    const raw = localStorage.getItem(key);
    if (!raw) continue;
    let state: ResumablePersistedState;
    try {
      state = JSON.parse(raw) as ResumablePersistedState;
    } catch {
      // Corrupt entries get garbage-collected on the next pass instead
      // of inside the iteration to avoid mutating localStorage while we
      // iterate over its indices.
      continue;
    }
    if (new Date(state.expiresAt).getTime() < now) {
      // Expired — drop after the loop completes (collect first).
      out.push({
        uploadId: state.uploadId,
        shareId: state.shareId,
        expiresAt: state.expiresAt,
        fileCount: state.files.length,
        totalCipherBytes: state.files.reduce((s, f) => s + f.cipherSize, 0),
        passwordProtected: state.password !== null,
      });
      continue;
    }
    out.push({
      uploadId: state.uploadId,
      shareId: state.shareId,
      expiresAt: state.expiresAt,
      fileCount: state.files.length,
      totalCipherBytes: state.files.reduce((s, f) => s + f.cipherSize, 0),
      passwordProtected: state.password !== null,
    });
  }
  // Prune expired entries (best-effort; a quota error here means we
  // tried to remove during a parallel write — ignored).
  for (const summary of out) {
    if (new Date(summary.expiresAt).getTime() < now) {
      try {
        localStorage.removeItem(persistedKey(summary.uploadId));
      } catch {
        /* ignore */
      }
    }
  }
  return out.filter((s) => new Date(s.expiresAt).getTime() >= now);
}

/**
 * Public API for the homepage's "discard pending upload" button. Removes
 * the localStorage entry without touching the server (the cleanup job
 * reaps the orphan within `UPLOAD_RESUME_HOURS`).
 */
export function discardPendingUpload(uploadId: string): void {
  clearPersisted(uploadId);
}

function savePersisted(state: ResumablePersistedState): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(persistedKey(state.uploadId), JSON.stringify(state));
  } catch {
    /* quota or disabled — non-fatal */
  }
}

function clearPersisted(uploadId: string): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.removeItem(persistedKey(uploadId));
  } catch {
    /* ignore */
  }
}

/**
 * Start a new resumable upload. The handle's `done` promise resolves
 * once finalize succeeds; reject paths include network errors that
 * survived all in-handle retries, server validation failures, and the
 * caller invoking `cancel()`.
 */
export function startResumableUpload(
  files: File[],
  options: ResumableUploadOptions,
): ResumableUploadHandle {
  if (files.length === 0) {
    return failedHandle(new Error('No files selected'));
  }

  const fetchImpl = options.fetchImpl ?? fetch.bind(globalThis);

  let pauseGate: Promise<void> | null = null;
  let pauseResolve: (() => void) | null = null;
  let cancelled = false;
  let inflight: Promise<unknown> | null = null;
  let uploadIdResolve!: (id: string) => void;
  const uploadIdPromise = new Promise<string>((r) => {
    uploadIdResolve = r;
  });

  const pause = async (): Promise<void> => {
    if (pauseGate) return;
    pauseGate = new Promise<void>((r) => {
      pauseResolve = r;
    });
    if (inflight) {
      try {
        await inflight;
      } catch {
        /* surfaced through done */
      }
    }
  };
  const resume = (): void => {
    if (pauseResolve) {
      pauseResolve();
      pauseResolve = null;
      pauseGate = null;
    }
  };

  const driver = (async (): Promise<ResumableUploadResult> => {
    const masterKey = await generateKey();
    const keyB64 = await exportKeyBase64url(masterKey);

    let passwordBundle: { salt: string; ivWrap: string; wrappedKey: string } | null = null;
    if (options.password && options.password.length > 0) {
      const bundle = await wrapMasterKey(masterKey, options.password);
      passwordBundle = {
        salt: bundle.salt,
        ivWrap: bundle.ivWrap,
        wrappedKey: bundle.wrappedKey,
      };
    }

    // 1. Plan all files into chunks at a placeholder chunk size; the real
    //    chunk size comes back from the server's create response.
    let plans = planAllFiles(files, /* placeholder */ 16 * 1024 * 1024);

    const createBody: ResumableUploadCreateRequest = {
      blobs: plans.map((p) => ({
        blobId: p.blobId,
        cipherSize: p.cipherSize,
        chunkCount: p.chunks.length,
      })),
      expiryHours: options.expiryHours,
      downloadLimit: options.downloadLimit,
      passwordProtected: passwordBundle !== null,
      salt: passwordBundle?.salt ?? null,
      ivWrap: passwordBundle?.ivWrap ?? null,
      wrappedKey: passwordBundle?.wrappedKey ?? null,
      notifyEmail: options.notifyEmail?.trim() || null,
    };

    const createRes = await postJson(fetchImpl, '/api/v1/uploads', createBody);
    if (!createRes.ok) throw await asError(createRes, 'create upload');
    const created = (await createRes.json()) as ResumableUploadCreateResponse;
    uploadIdResolve(created.uploadId);
    options.onUploadIdReady?.(created.uploadId, keyB64);

    // 2. Re-plan with the server's authoritative chunk size if it differs.
    if (created.chunkSize !== plans[0]?.chunkSize) {
      plans = planAllFiles(files, created.chunkSize);
      // The server's blob plan was registered with the client's old sizes;
      // if they diverged we cancel and retry once with the right values.
      const recheckBody: ResumableUploadCreateRequest = {
        ...createBody,
        blobs: plans.map((p) => ({
          blobId: p.blobId,
          cipherSize: p.cipherSize,
          chunkCount: p.chunks.length,
        })),
      };
      // Cancel the mismatched upload and create a fresh one with the
      // correct chunk size.
      await fetchImpl(`/api/v1/uploads/${created.uploadId}`, { method: 'DELETE' });
      const retryRes = await postJson(fetchImpl, '/api/v1/uploads', recheckBody);
      if (!retryRes.ok) throw await asError(retryRes, 'create upload (retry)');
      const retry = (await retryRes.json()) as ResumableUploadCreateResponse;
      uploadIdResolve(retry.uploadId);
      options.onUploadIdReady?.(retry.uploadId, keyB64);
      Object.assign(created, retry);
    }

    const persisted: ResumablePersistedState = {
      uploadId: created.uploadId,
      shareId: created.shareId,
      expiresAt: created.expiresAt,
      keyB64: null, // intentionally do NOT persist the key
      files: plans.map((p) => ({
        blobId: p.blobId,
        cipherSize: p.cipherSize,
        chunkSize: p.chunkSize,
        chunks: p.chunks.map(() => ({ ivB64: '' })),
      })),
      password: passwordBundle,
      noteB64: options.note ? toBase64url(new TextEncoder().encode(options.note.trim())) : null,
      expiryHours: options.expiryHours,
      downloadLimit: options.downloadLimit,
    };
    savePersisted(persisted);

    // 3. Encrypt + PATCH each chunk in order. We process files
    //    sequentially and chunks within a file sequentially. Parallel
    //    files would speed throughput at the cost of more concurrent
    //    server PATCH requests; deferred to a follow-up.
    const totalBytes = plans.reduce((s, p) => s + p.cipherSize, 0);
    let sentBytes = 0;
    options.onProgress?.(0, totalBytes);

    for (let bIdx = 0; bIdx < plans.length; bIdx++) {
      const plan = plans[bIdx]!;
      const file = files[bIdx]!;
      const persistedFile = persisted.files[bIdx]!;

      for (let cIdx = 0; cIdx < plan.chunks.length; cIdx++) {
        if (cancelled) throw new Error('Upload cancelled');
        if (pauseGate) await pauseGate;

        const chunk = plan.chunks[cIdx]!;
        const enc = await encryptFileChunk(masterKey, file, chunk);
        persistedFile.chunks[cIdx] = { ivB64: enc.ivB64 };
        savePersisted(persisted);

        inflight = patchChunk(fetchImpl, created.uploadId, bIdx, cIdx, enc.cipher);
        const patchRes = await inflight;
        inflight = null;
        if (!(patchRes as Response).ok) {
          throw await asError(patchRes as Response, `chunk ${bIdx}.${cIdx}`);
        }

        sentBytes += enc.cipher.byteLength;
        options.onProgress?.(sentBytes, totalBytes);
        options.onChunkAccepted?.(bIdx, cIdx, plan.chunks.length);
      }
    }

    // 4. Build manifest v2 from the per-chunk IVs we just emitted.
    const manifestFiles: ManifestFileV2[] = plans.map((plan, bIdx) => ({
      name: files[bIdx]!.name,
      size: files[bIdx]!.size,
      mime: files[bIdx]!.type || 'application/octet-stream',
      blobId: plan.blobId,
      chunkSize: plan.chunkSize,
      chunks: plan.chunks.map((c, idx) => ({
        iv: persisted.files[bIdx]!.chunks[idx]!.ivB64,
        cipherSize: c.sizePlain + 16,
      })),
    }));
    const manifest: ManifestV2 = {
      version: 2,
      files: manifestFiles,
      note: options.note?.trim() || null,
    };

    const manifestPlain = new TextEncoder().encode(JSON.stringify(manifest));
    const manifestIv = generateIV();
    const manifestCipher = await encrypt(masterKey, manifestIv, new Uint8Array(manifestPlain));

    // 5. Finalize.
    const finalizeForm = new FormData();
    finalizeForm.append('manifest-iv', toBase64url(manifestIv));
    finalizeForm.append(
      'manifest',
      new Blob([manifestCipher], { type: 'application/octet-stream' }),
      'manifest',
    );

    const finalizeRes = await fetchImpl(`/api/v1/uploads/${created.uploadId}/finalize`, {
      method: 'POST',
      body: finalizeForm,
    });
    if (!finalizeRes.ok) throw await asError(finalizeRes, 'finalize');
    const finalized = (await finalizeRes.json()) as {
      id: string;
      wordcode: string | null;
      expiresAt: string;
    };

    clearPersisted(created.uploadId);
    return {
      id: finalized.id,
      key: keyB64,
      expiresAt: finalized.expiresAt,
      wordcode: finalized.wordcode,
    };
  })();

  const cancel = async (): Promise<void> => {
    cancelled = true;
    resume(); // unblock the loop so it can hit the cancel check
    try {
      const id = await Promise.race([
        uploadIdPromise,
        new Promise<string | null>((r) => setTimeout(() => r(null), 100)),
      ]);
      if (typeof id === 'string') {
        await fetchImpl(`/api/v1/uploads/${id}`, { method: 'DELETE' });
        clearPersisted(id);
      }
    } catch {
      /* best-effort */
    }
  };

  const handle: ResumableUploadHandle = {
    done: driver,
    pause,
    resume,
    cancel,
    uploadId: uploadIdPromise,
  };
  // Surface unhandled-rejection cleanly when the caller awaits `done`.
  driver.catch(() => undefined);
  return handle;
}

/**
 * Resume a previously-created upload after a tab close. The caller
 * supplies the same File handles (the user has to re-pick them — the
 * browser does not retain `File` references across reloads), the
 * existing `uploadId`, and the master key as a base64url string (the
 * key only lives in the URL fragment; localStorage is intentionally
 * key-free so a stolen disk image cannot decrypt staged ciphertext).
 *
 * The driver fetches `GET /api/v1/uploads/:id` to learn what the server
 * already accepted and skips ahead. New IVs are generated for chunks
 * the server has not yet seen; previously-persisted IVs are reused for
 * already-accepted chunks (the server already has the matching cipher
 * on disk, so the manifest must point at the same IVs).
 */
export function resumeExistingUpload(
  uploadId: string,
  files: File[],
  keyB64: string,
  options: ResumableUploadOptions,
): ResumableUploadHandle {
  if (typeof localStorage === 'undefined') {
    return failedHandle(new Error('Resume requires localStorage'));
  }
  if (!keyB64) {
    return failedHandle(new Error('Resume requires the master key (URL fragment missing?)'));
  }
  const raw = localStorage.getItem(persistedKey(uploadId));
  if (!raw) return failedHandle(new Error('No persisted state for this upload'));
  let persisted: ResumablePersistedState;
  try {
    persisted = JSON.parse(raw) as ResumablePersistedState;
  } catch {
    return failedHandle(new Error('Persisted state corrupt'));
  }
  if (new Date(persisted.expiresAt).getTime() < Date.now()) {
    clearPersisted(uploadId);
    return failedHandle(new Error('Resume window expired'));
  }
  if (files.length !== persisted.files.length) {
    return failedHandle(new Error('File count differs from persisted plan'));
  }
  for (let i = 0; i < files.length; i++) {
    if (files[i]!.size !== sumPlainBytes(persisted.files[i]!)) {
      return failedHandle(new Error(`File ${i} size differs from persisted plan`));
    }
  }
  return resumeWithPersisted(uploadId, files, keyB64, persisted, options);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function planAllFiles(files: File[], chunkSize: number): ChunkPlanFile[] {
  return files.map((f, i) =>
    planFileChunks(f.size, chunkSize, `blob-${String(i + 1).padStart(4, '0')}`),
  );
}

async function postJson(fetchImpl: typeof fetch, url: string, body: unknown): Promise<Response> {
  return fetchImpl(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function patchChunk(
  fetchImpl: typeof fetch,
  uploadId: string,
  blobIndex: number,
  chunkIndex: number,
  cipher: Uint8Array<ArrayBuffer>,
): Promise<Response> {
  return fetchImpl(`/api/v1/uploads/${uploadId}/blobs/${blobIndex}/chunks/${chunkIndex}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Length': String(cipher.byteLength),
    },
    body: cipher,
  });
}

async function asError(res: Response, where: string): Promise<Error> {
  let detail = `${res.status} ${res.statusText}`;
  try {
    const body = (await res.json()) as { error?: string };
    if (body.error) detail = body.error;
  } catch {
    /* non-JSON body */
  }
  return new Error(`Upload failed during ${where}: ${detail}`);
}

function failedHandle(err: Error): ResumableUploadHandle {
  return {
    done: Promise.reject(err),
    pause: async () => undefined,
    resume: () => undefined,
    cancel: async () => undefined,
    uploadId: Promise.reject(err),
  };
}

function sumPlainBytes(f: PersistedFileState): number {
  // Each chunk on disk is plaintext + 16 (GCM tag); reverse to recover
  // the file's plaintext size from the persisted cipher-side counts.
  return f.cipherSize - f.chunks.length * 16;
}

function resumeWithPersisted(
  uploadId: string,
  files: File[],
  keyB64: string,
  persisted: ResumablePersistedState,
  options: ResumableUploadOptions,
): ResumableUploadHandle {
  const fetchImpl = options.fetchImpl ?? fetch.bind(globalThis);

  let pauseGate: Promise<void> | null = null;
  let pauseResolve: (() => void) | null = null;
  let cancelled = false;
  let inflight: Promise<unknown> | null = null;

  const pause = async (): Promise<void> => {
    if (pauseGate) return;
    pauseGate = new Promise<void>((r) => {
      pauseResolve = r;
    });
    if (inflight) {
      try {
        await inflight;
      } catch {
        /* surfaced through done */
      }
    }
  };
  const resume = (): void => {
    if (pauseResolve) {
      pauseResolve();
      pauseResolve = null;
      pauseGate = null;
    }
  };

  const driver = (async (): Promise<ResumableUploadResult> => {
    const masterKey = await importKeyBase64url(keyB64);

    // Notify the host page that the resume picked up the prior id+key
    // pair so it can re-write the URL fragment (idempotent — the page
    // typically navigated to that fragment to land here).
    options.onUploadIdReady?.(uploadId, keyB64);

    // 1. Ask the server which chunks it already accepted. The persisted
    //    `receivedChunks` count is a lower bound (the localStorage write
    //    races the PATCH response), so the server is authoritative.
    const stateRes = await fetchImpl(`/api/v1/uploads/${uploadId}`);
    if (stateRes.status === 410 || stateRes.status === 404) {
      clearPersisted(uploadId);
      throw new Error('Upload window expired or unknown — start a fresh upload');
    }
    if (!stateRes.ok) throw await asError(stateRes, 'state lookup');
    const serverState = (await stateRes.json()) as ResumableUploadState;
    if (serverState.finalized) {
      clearPersisted(uploadId);
      throw new Error('Upload was already finalized in another tab');
    }

    if (serverState.blobs.length !== persisted.files.length) {
      throw new Error('Server blob count differs from persisted plan');
    }

    // 2. Re-plan files at the persisted chunkSize. The server announced
    //    this size at create-time and refuses to change it for the same
    //    uploadId, so the persisted value is authoritative for what the
    //    server has already on disk.
    const chunkSize = persisted.files[0]?.chunkSize ?? 16 * 1024 * 1024;
    const plans = files.map((f, i) =>
      planFileChunks(f.size, chunkSize, persisted.files[i]!.blobId),
    );

    // 3. Sanity-check that our local plan agrees with what the server
    //    expects. If the chunk counts differ the upload is unrecoverable
    //    (different file content). Refuse before any PATCH.
    for (let i = 0; i < plans.length; i++) {
      const local = plans[i]!;
      const server = serverState.blobs[i]!;
      if (local.chunks.length !== server.chunkCount || local.cipherSize !== server.cipherSize) {
        throw new Error(
          `Blob ${i} differs from the original upload — pick the same files to resume`,
        );
      }
    }

    // 4. Walk each blob's missing chunks and PATCH them. For chunks the
    //    server already accepted (cIdx < receivedChunks), reuse the
    //    persisted IV — the manifest must reference the IV that matches
    //    the ciphertext on disk. For new chunks, generate a fresh IV via
    //    encryptFileChunk just like the original-create path.
    const totalBytes = plans.reduce((s, p) => s + p.cipherSize, 0);
    let sentBytes = serverState.blobs.reduce((s, b) => s + b.receivedBytes, 0);
    options.onProgress?.(sentBytes, totalBytes);

    for (let bIdx = 0; bIdx < plans.length; bIdx++) {
      const plan = plans[bIdx]!;
      const file = files[bIdx]!;
      const persistedFile = persisted.files[bIdx]!;
      const blobState = serverState.blobs[bIdx]!;
      const startChunk = blobState.receivedChunks;

      for (let cIdx = startChunk; cIdx < plan.chunks.length; cIdx++) {
        if (cancelled) throw new Error('Upload cancelled');
        if (pauseGate) await pauseGate;

        const chunk = plan.chunks[cIdx]!;
        const enc = await encryptFileChunk(masterKey, file, chunk);
        // Update the persisted IV to whatever we just generated; the
        // PATCH below races the localStorage write but a partial IV
        // record is still useful (it lets a second resume target the
        // same byte slot with the same IV after retry).
        persistedFile.chunks[cIdx] = { ivB64: enc.ivB64 };
        savePersisted(persisted);

        inflight = patchChunk(fetchImpl, uploadId, bIdx, cIdx, enc.cipher);
        const patchRes = await inflight;
        inflight = null;
        if (!(patchRes as Response).ok) {
          throw await asError(patchRes as Response, `chunk ${bIdx}.${cIdx}`);
        }
        sentBytes += enc.cipher.byteLength;
        options.onProgress?.(sentBytes, totalBytes);
        options.onChunkAccepted?.(bIdx, cIdx, plan.chunks.length);
      }
    }

    // 5. Build manifest v2 from the per-chunk IVs. For chunks that were
    //    accepted in a prior session we pull the IV from the persisted
    //    state (those IVs match the on-disk ciphertext); fresh chunks
    //    were just written above with newly-generated IVs.
    const manifestFiles: ManifestFileV2[] = plans.map((plan, bIdx) => ({
      name: files[bIdx]!.name,
      size: files[bIdx]!.size,
      mime: files[bIdx]!.type || 'application/octet-stream',
      blobId: plan.blobId,
      chunkSize: plan.chunkSize,
      chunks: plan.chunks.map((c, idx) => ({
        iv: persisted.files[bIdx]!.chunks[idx]!.ivB64,
        cipherSize: c.sizePlain + 16,
      })),
    }));
    // Defensive: every chunk must have an IV by now. Missing IV =
    // localStorage was wiped between resume and finalize.
    for (const f of manifestFiles) {
      for (const c of f.chunks) {
        if (!c.iv) {
          throw new Error('Persisted IV missing — resume state was tampered with');
        }
      }
    }

    const note = persisted.noteB64
      ? new TextDecoder().decode(fromBase64urlBytes(persisted.noteB64))
      : null;
    const manifest: ManifestV2 = {
      version: 2,
      files: manifestFiles,
      note,
    };
    const manifestPlain = new TextEncoder().encode(JSON.stringify(manifest));
    const manifestIv = generateIV();
    const manifestCipher = await encrypt(masterKey, manifestIv, new Uint8Array(manifestPlain));

    const finalizeForm = new FormData();
    finalizeForm.append('manifest-iv', toBase64url(manifestIv));
    finalizeForm.append(
      'manifest',
      new Blob([manifestCipher], { type: 'application/octet-stream' }),
      'manifest',
    );

    const finalizeRes = await fetchImpl(`/api/v1/uploads/${uploadId}/finalize`, {
      method: 'POST',
      body: finalizeForm,
    });
    if (!finalizeRes.ok) throw await asError(finalizeRes, 'finalize');
    const finalized = (await finalizeRes.json()) as {
      id: string;
      wordcode: string | null;
      expiresAt: string;
    };

    clearPersisted(uploadId);
    return {
      id: finalized.id,
      key: keyB64,
      expiresAt: finalized.expiresAt,
      wordcode: finalized.wordcode,
    };
  })();

  const cancel = async (): Promise<void> => {
    cancelled = true;
    resume();
    try {
      await fetchImpl(`/api/v1/uploads/${uploadId}`, { method: 'DELETE' });
      clearPersisted(uploadId);
    } catch {
      /* best-effort */
    }
  };

  driver.catch(() => undefined);
  return {
    done: driver,
    pause,
    resume,
    cancel,
    uploadId: Promise.resolve(uploadId),
  };
}

/**
 * Decode a base64url-encoded string into a `Uint8Array`. Tolerates the
 * `=` padding being absent (the encoder we use never emits it).
 */
function fromBase64urlBytes(s: string): Uint8Array {
  const padded = s.replace(/-/g, '+').replace(/_/g, '/');
  const padding = padded.length % 4 === 0 ? '' : '='.repeat(4 - (padded.length % 4));
  const binary = atob(padded + padding);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

// Re-export so callers can import everything from one module.
export { importKeyBase64url };
