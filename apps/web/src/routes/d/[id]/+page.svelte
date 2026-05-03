<script lang="ts">
  import { onMount } from 'svelte';
  import { _ } from 'svelte-i18n';
  import type { Manifest, ManifestV2 } from '@itsweber-send/shared';
  import FileIcon from '$lib/components/icons/FileIcon.svelte';
  import {
    importKeyBase64url,
    decrypt,
    fromBase64url,
    unwrapMasterKey,
  } from '$lib/crypto/index.js';
  import {
    decodeManifest,
    downloadV1,
    downloadV2,
    streamV1ToWritable,
    streamV2ToWritable,
  } from '$lib/download/client.js';
  import {
    pickFileDestination,
    pickZipDestination,
    streamShareAsZip,
    supportsFileSystemAccess,
    type ZipProgress,
  } from '$lib/download/zip.js';
  import type { DownloadManifestResponse } from '@itsweber-send/shared';

  type Phase = 'loading' | 'password_required' | 'decrypting' | 'ready' | 'error';
  type FileState = 'idle' | 'downloading' | 'done';
  type ZipPhase = 'idle' | 'streaming' | 'done' | 'error';

  const { data } = $props<{ data: { id: string } }>();
  const shareId = $derived(data.id);

  let phase = $state<Phase>('loading');
  let errorMsg = $state('');
  let passwordInput = $state('');
  let wrongPassword = $state(false);

  let manifestResponse = $state<DownloadManifestResponse | null>(null);
  let manifest = $state<Manifest | ManifestV2 | null>(null);
  let manifestVersion = $state<1 | 2>(1);
  let masterKey = $state<CryptoKey | null>(null);

  let fileStates = $state<FileState[]>([]);

  // Block B (ZIP streaming) state. The browser-capability check happens
  // once on mount; the FSA gate is the only thing standing between the
  // ZIP path and a memory blow-up on huge multi-file shares.
  let fsaSupported = $state(false);
  let zipPhase = $state<ZipPhase>('idle');
  let zipProgress = $state<ZipProgress | null>(null);

  function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
    return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
  }

  async function fetchManifest(): Promise<void> {
    const res = await fetch(`/api/v1/download/${shareId}/manifest`);
    if (res.status === 404) {
      phase = 'error';
      errorMsg = $_('download.not_found');
      return;
    }
    if (res.status === 410) {
      const body = (await res.json()) as { error: string };
      phase = 'error';
      errorMsg = body.error.includes('expired') ? $_('download.expired') : $_('download.exhausted');
      return;
    }
    if (!res.ok) {
      phase = 'error';
      errorMsg = $_('download.not_found');
      return;
    }

    manifestResponse = (await res.json()) as DownloadManifestResponse;

    if (manifestResponse.passwordRequired) {
      phase = 'password_required';
    } else {
      await decryptWithFragmentKey();
    }
  }

  async function decryptWithFragmentKey(): Promise<void> {
    if (!manifestResponse) return;
    const fragment = window.location.hash.slice(1);
    const params = new URLSearchParams(fragment);
    const keyB64 = params.get('k');

    if (!keyB64) {
      phase = 'error';
      errorMsg = $_('download.no_key');
      return;
    }

    phase = 'decrypting';
    try {
      const key = await importKeyBase64url(keyB64);
      await doDecryptManifest(key);
    } catch {
      phase = 'error';
      errorMsg = $_('download.error_decrypt');
    }
  }

  async function decryptWithPassword(): Promise<void> {
    if (!manifestResponse) return;
    const { salt, ivWrap, wrappedKey } = manifestResponse;
    if (!salt || !ivWrap || !wrappedKey) {
      phase = 'error';
      errorMsg = $_('download.error_decrypt');
      return;
    }

    phase = 'decrypting';
    try {
      const key = await unwrapMasterKey(passwordInput, salt, ivWrap, wrappedKey);
      await doDecryptManifest(key);
    } catch {
      wrongPassword = true;
      phase = 'password_required';
    }
  }

  async function doDecryptManifest(key: CryptoKey): Promise<void> {
    if (!manifestResponse) return;
    const ciphertext = fromBase64url(manifestResponse.manifestCiphertext);
    const iv = fromBase64url(manifestResponse.manifestIv);

    const plaintext = await decrypt(key, iv, ciphertext);
    let decoded;
    try {
      decoded = decodeManifest(new TextDecoder().decode(plaintext));
    } catch (err) {
      phase = 'error';
      errorMsg = err instanceof Error ? err.message : $_('download.error_decrypt');
      return;
    }

    masterKey = key;
    manifest = decoded.manifest;
    manifestVersion = decoded.version;
    fileStates = Array.from({ length: decoded.manifest.files.length }, () => 'idle' as FileState);
    phase = 'ready';
  }

  function saveBlob(blob: Blob, name: string): void {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  async function downloadFile(fileIndex: number): Promise<void> {
    if (!manifest || !masterKey) return;
    const file = manifest.files[fileIndex];
    if (!file) return;

    fileStates[fileIndex] = 'downloading';
    const blobNum = parseInt(file.blobId.replace('blob-', ''), 10);

    // FSA streaming-to-disk path (Chrome/Edge). For v2 this keeps peak
    // RAM bounded by the manifest's chunk size — a 50 GB file decrypts in
    // 16 MiB increments and writes plaintext straight to disk, so the
    // browser never holds the full plaintext in memory. v1 remains a
    // single AES-GCM op (legacy 500 MB cap), but skipping the Blob save
    // step still halves peak RAM.
    //
    // Fall back to the buffered Blob path when FSA is unavailable, the
    // permission flow rejects (no user gesture, no transient activation,
    // SecurityError under automation), or the call throws for any other
    // reason. The user-cancel case (`null` from pickFileDestination)
    // intentionally does NOT fall back — the user explicitly said no.
    if (fsaSupported) {
      let writable: WritableStream<Uint8Array> | null = null;
      let pickerThrew = false;
      try {
        writable = await pickFileDestination(file.name, file.mime || 'application/octet-stream');
      } catch {
        pickerThrew = true;
      }
      if (writable) {
        try {
          if (manifestVersion === 1) {
            const v1file = file as Manifest['files'][number];
            await streamV1ToWritable(shareId, blobNum, v1file.iv, masterKey, writable);
          } else {
            const v2file = file as ManifestV2['files'][number];
            await streamV2ToWritable(shareId, blobNum, v2file.chunks, masterKey, writable);
          }
          fileStates[fileIndex] = 'done';
        } catch {
          try {
            await writable.abort('decrypt or pipe failed');
          } catch {
            /* writable may already be locked / closed */
          }
          fileStates[fileIndex] = 'idle';
          errorMsg = $_('download.error_decrypt');
        }
        return;
      }
      // User-cancel (null + no throw): respect it — don't auto-fall-back.
      if (!pickerThrew) {
        fileStates[fileIndex] = 'idle';
        return;
      }
      // Picker threw (no user gesture / permission denied / unsupported
      // under automation) — fall through to the buffered Blob path so
      // the recipient still gets the file.
    }

    // Fallback: Safari / Firefox without FSA. Buffered Blob path; capped
    // by browser RAM. Single-file sends >~2 GB will OOM here — surfaced
    // as the existing decrypt error rather than crashing the tab.
    try {
      if (manifestVersion === 1) {
        const v1file = file as Manifest['files'][number];
        const iv = fromBase64url(v1file.iv);
        const plaintext = await downloadV1(shareId, blobNum, iv, masterKey);
        saveBlob(new Blob([plaintext], { type: v1file.mime }), v1file.name);
      } else {
        const v2file = file as ManifestV2['files'][number];
        const blob = await downloadV2(shareId, blobNum, v2file.chunks, v2file.mime, masterKey);
        saveBlob(blob, v2file.name);
      }
      fileStates[fileIndex] = 'done';
    } catch {
      fileStates[fileIndex] = 'idle';
      errorMsg = $_('download.error_decrypt');
    }
  }

  /**
   * ZIP-streaming path. Uses showSaveFilePicker so the browser writes the
   * archive directly to disk — no in-memory ZIP buffer. The streamShareAsZip
   * helper fetches each blob in manifest order, decrypts chunk-by-chunk,
   * and pipes the plaintext through the ZIP encoder into the writable.
   * The server-side download counter increments exactly once on the last
   * blob's full read, so a ZIP counts as one share-download.
   */
  async function downloadAllAsZip(): Promise<void> {
    if (!manifest || !masterKey || zipPhase === 'streaming') return;
    if (!fsaSupported) return;

    let writable: WritableStream<Uint8Array> | null;
    try {
      writable = await pickZipDestination(`share-${shareId}.zip`);
    } catch {
      zipPhase = 'error';
      errorMsg = $_('download.zip_failed');
      return;
    }
    if (!writable) {
      // User cancelled the save dialog; stay in idle, no error.
      return;
    }

    zipPhase = 'streaming';
    zipProgress = null;
    errorMsg = '';
    try {
      await streamShareAsZip(
        shareId,
        manifestVersion === 2
          ? { version: 2, manifest: manifest as ManifestV2 }
          : { version: 1, manifest: manifest as Manifest },
        masterKey,
        writable,
        (p) => {
          zipProgress = p;
        },
      );
      zipPhase = 'done';
      zipProgress = null;
      // Mark every per-file state as 'done' so the UI reflects completion.
      fileStates = fileStates.map(() => 'done' as FileState);
    } catch {
      zipPhase = 'error';
      errorMsg = $_('download.zip_failed');
      try {
        await writable.abort('zip stream failed');
      } catch {
        // best-effort cleanup
      }
    }
  }

  onMount(() => {
    fsaSupported = supportsFileSystemAccess();
    void fetchManifest();
  });
</script>

<main class="page">
  <div class="card-wrap">
    {#if phase === 'loading'}
      <div class="card center-card">
        <span class="spinner" aria-hidden="true"></span>
        <p>{$_('download.loading')}</p>
      </div>
    {:else if phase === 'password_required'}
      <div class="card lock-card">
        <div class="lock-icon">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.6"
            stroke-linecap="round"
            stroke-linejoin="round"
            width="36"
            height="36"
            aria-hidden="true"
          >
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
        </div>
        <h2>{$_('download.password_required')}</h2>
        {#if wrongPassword}
          <p class="error-inline">{$_('download.wrong_password')}</p>
        {/if}
        <form
          onsubmit={(e) => {
            e.preventDefault();
            void decryptWithPassword();
          }}
        >
          <input
            type="password"
            class="password-input"
            placeholder={$_('download.password_placeholder')}
            bind:value={passwordInput}
            autocomplete="current-password"
          />
          <button class="btn-primary" type="submit" disabled={!passwordInput.trim()}>
            {$_('download.unlock')}
          </button>
        </form>
      </div>
    {:else if phase === 'decrypting'}
      <div class="card center-card">
        <span class="spinner" aria-hidden="true"></span>
        <p>{$_('download.decrypting')}</p>
      </div>
    {:else if phase === 'ready' && manifest}
      <div class="card ready-card">
        <h2>{$_('download.ready_title')}</h2>

        {#if manifest.note}
          <div class="note-box">
            <p class="note-label">{$_('download.note_from_sender')}</p>
            <p class="note-text">{manifest.note}</p>
          </div>
        {/if}

        {#if manifest.files.length > 1}
          {#if fsaSupported}
            <button
              class="btn-download-all"
              onclick={() => void downloadAllAsZip()}
              disabled={zipPhase === 'streaming'}
            >
              {#if zipPhase === 'streaming'}
                <span class="spinner-sm" aria-hidden="true"></span>
              {:else}
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.6"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  width="15"
                  height="15"
                  aria-hidden="true"
                >
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
              {/if}
              {#if zipPhase === 'streaming'}
                {$_('download.zip_streaming_in_progress')}
              {:else}
                {$_('download.download_all_zip')}
              {/if}
            </button>
            {#if zipPhase === 'streaming' && zipProgress}
              <p class="zip-progress" aria-live="polite">
                {$_('download.zip_progress_file', {
                  values: {
                    current: zipProgress.fileIndex + 1,
                    total: zipProgress.fileCount,
                    name: zipProgress.fileName,
                  },
                })}
              </p>
            {/if}
          {:else}
            <div class="zip-unavailable" role="note" aria-live="polite">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="1.6"
                stroke-linecap="round"
                stroke-linejoin="round"
                width="14"
                height="14"
                aria-hidden="true"
              >
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              <div>
                <p class="zip-unavailable-title">{$_('download.zip_unavailable_title')}</p>
                <p class="zip-unavailable-hint">{$_('download.zip_unavailable_hint')}</p>
              </div>
            </div>
          {/if}
        {/if}

        <ul class="file-list" aria-label="Dateien">
          {#each manifest.files as file, i}
            <li class="file-entry">
              <span class="file-icon"><FileIcon size={15} /></span>
              <div class="file-info">
                <span class="file-name">{file.name}</span>
                <span class="file-meta">{formatBytes(file.size)} · {file.mime}</span>
              </div>
              <button
                class="btn-download"
                class:is-done={fileStates[i] === 'done'}
                onclick={() => void downloadFile(i)}
                disabled={fileStates[i] === 'downloading'}
                aria-label="{file.name} {$_('download.download_button')}"
              >
                {#if fileStates[i] === 'downloading'}
                  <span class="spinner-sm" aria-hidden="true"></span>
                {:else if fileStates[i] === 'done'}
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    width="14"
                    height="14"
                    aria-hidden="true"
                  >
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                {:else}
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="1.6"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    width="14"
                    height="14"
                    aria-hidden="true"
                  >
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="7 10 12 15 17 10" />
                    <line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                {/if}
                {$_('download.download_button')}
              </button>
            </li>
          {/each}
        </ul>

        {#if manifestResponse?.remainingDownloads !== null && manifestResponse?.remainingDownloads !== undefined}
          <p class="remaining-note">
            Verbleibende Downloads: {manifestResponse.remainingDownloads}
          </p>
        {/if}

        {#if errorMsg}
          <p class="error-inline">{errorMsg}</p>
        {/if}

        <p class="encrypted-note">{$_('download.encrypted_note')}</p>
      </div>
    {:else if phase === 'error'}
      <div class="card error-card">
        <div class="error-icon">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.6"
            stroke-linecap="round"
            stroke-linejoin="round"
            width="36"
            height="36"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="15" y1="9" x2="9" y2="15" />
            <line x1="9" y1="9" x2="15" y2="15" />
          </svg>
        </div>
        <p class="error-msg">{errorMsg}</p>
        <a class="btn-secondary" href="/">{$_('upload.new_upload')}</a>
      </div>
    {/if}
  </div>
</main>

<style>
  .page {
    max-width: 560px;
    margin: 0 auto;
    padding: 80px 24px;
  }

  .card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 16px;
    padding: 32px 28px;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.06);
  }

  .center-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 16px;
    color: var(--muted);
    font-size: 15px;
    padding: 56px 28px;
  }

  /* Lock card */
  .lock-card {
    text-align: center;
  }
  .lock-icon,
  .error-icon {
    display: inline-flex;
    padding: 14px;
    border-radius: 50%;
    margin-bottom: 8px;
  }
  .lock-icon {
    background: color-mix(in srgb, var(--brand) 12%, transparent);
    color: var(--brand);
  }
  .error-icon {
    background: color-mix(in srgb, #d9534f 12%, transparent);
    color: #d9534f;
  }

  h2 {
    margin: 0 0 16px;
    font-size: 20px;
  }

  .error-inline {
    color: #d9534f;
    font-size: 13px;
    margin: 0 0 10px;
  }

  /* Password form */
  .password-input {
    width: 100%;
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: 8px;
    color: var(--text);
    font-size: 14px;
    padding: 10px 12px;
    box-sizing: border-box;
    margin-bottom: 12px;
  }
  .password-input:focus {
    outline: 2px solid var(--brand);
    outline-offset: 2px;
  }

  /* Note box */
  .note-box {
    background: color-mix(in srgb, var(--brand) 7%, var(--surface-2));
    border: 1px solid color-mix(in srgb, var(--brand) 25%, var(--border));
    border-radius: 10px;
    padding: 12px 14px;
    margin-bottom: 18px;
  }
  .note-label {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.07em;
    color: var(--brand);
    margin: 0 0 4px;
    font-weight: 600;
  }
  .note-text {
    font-size: 14px;
    line-height: 1.55;
    margin: 0;
    color: var(--text);
    white-space: pre-wrap;
  }

  /* Download all button */
  .btn-download-all {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    width: 100%;
    padding: 11px 16px;
    margin-bottom: 14px;
    background: var(--brand);
    color: #0a1a26;
    border: none;
    border-radius: 10px;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    justify-content: center;
    transition: opacity 0.15s;
    min-height: 44px;
  }
  .btn-download-all:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }
  .btn-download-all:not(:disabled):hover {
    opacity: 0.88;
  }

  .zip-progress {
    color: var(--muted);
    font-size: 12px;
    margin: 0 0 14px;
    text-align: center;
    word-break: break-word;
  }

  .zip-unavailable {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    padding: 12px 14px;
    margin-bottom: 14px;
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: 10px;
    color: var(--muted);
  }
  .zip-unavailable svg {
    color: var(--muted);
    margin-top: 2px;
    flex-shrink: 0;
  }
  .zip-unavailable-title {
    font-size: 13px;
    font-weight: 600;
    margin: 0 0 2px;
    color: var(--text);
  }
  .zip-unavailable-hint {
    font-size: 12px;
    line-height: 1.45;
    margin: 0;
  }

  /* File list */
  .file-list {
    list-style: none;
    padding: 0;
    margin: 0 0 16px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .file-entry {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 12px 14px;
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: 10px;
  }
  .file-icon {
    color: var(--muted);
    flex-shrink: 0;
  }
  .file-info {
    min-width: 0;
    flex: 1;
  }
  .file-name {
    display: block;
    font-weight: 600;
    font-size: 14px;
    word-break: break-all;
  }
  .file-meta {
    display: block;
    color: var(--muted);
    font-size: 12px;
    margin-top: 2px;
  }

  .btn-download {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 8px 14px;
    background: var(--brand);
    color: #0a1a26;
    border: none;
    border-radius: 8px;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    white-space: nowrap;
    flex-shrink: 0;
    transition:
      opacity 0.15s,
      background 0.15s;
    min-height: 36px;
  }
  .btn-download:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }
  .btn-download:not(:disabled):hover {
    opacity: 0.85;
  }
  .btn-download.is-done {
    background: color-mix(in srgb, var(--brand) 20%, transparent);
    color: var(--brand);
    border: 1px solid color-mix(in srgb, var(--brand) 35%, transparent);
  }
  .btn-download.is-done:hover {
    opacity: 1;
  }

  .remaining-note {
    color: var(--muted);
    font-size: 12px;
    margin: 0 0 8px;
  }
  .encrypted-note {
    color: var(--dim);
    font-size: 12px;
    margin: 0;
  }

  /* Error card */
  .error-card {
    text-align: center;
  }
  .error-msg {
    color: var(--muted);
    font-size: 15px;
    margin: 0 0 20px;
  }

  /* Buttons */
  .btn-primary {
    width: 100%;
    padding: 12px 20px;
    background: var(--brand);
    color: #0a1a26;
    border: none;
    border-radius: 10px;
    font-size: 15px;
    font-weight: 600;
    cursor: pointer;
    transition: opacity 0.15s;
    min-height: 48px;
  }
  .btn-primary:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }
  .btn-primary:not(:disabled):hover {
    opacity: 0.88;
  }

  .btn-secondary {
    display: inline-block;
    padding: 10px 18px;
    background: var(--surface-2);
    color: var(--text);
    border: 1px solid var(--border);
    border-radius: 10px;
    font-size: 14px;
    text-decoration: none;
    cursor: pointer;
    transition: background 0.15s;
  }
  .btn-secondary:hover {
    background: var(--surface-3);
  }

  /* Spinners */
  .spinner {
    display: inline-block;
    width: 26px;
    height: 26px;
    border: 2.5px solid var(--border);
    border-top-color: var(--brand);
    border-radius: 50%;
    animation: spin 0.7s linear infinite;
  }
  .spinner-sm {
    display: inline-block;
    width: 13px;
    height: 13px;
    border: 2px solid rgba(10, 26, 38, 0.3);
    border-top-color: #0a1a26;
    border-radius: 50%;
    animation: spin 0.7s linear infinite;
    flex-shrink: 0;
  }
  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  /* Mobile */
  @media (max-width: 480px) {
    .page {
      padding: 40px 16px 60px;
    }
    .card {
      padding: 20px 16px;
    }
    .file-entry {
      flex-wrap: wrap;
    }
    .btn-download {
      width: 100%;
      justify-content: center;
    }
    .center-card {
      padding: 40px 16px;
    }
  }
</style>
