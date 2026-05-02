<script lang="ts">
  import { onMount } from 'svelte';
  import { _ } from 'svelte-i18n';
  import type { Manifest } from '@itsweber-send/shared';
  import BrandMark from '$lib/components/BrandMark.svelte';
  import ThemeToggle from '$lib/components/ThemeToggle.svelte';
  import {
    importKeyBase64url,
    decrypt,
    fromBase64url,
    unwrapMasterKey,
  } from '$lib/crypto/index.js';
  import type { DownloadManifestResponse } from '@itsweber-send/shared';

  type Phase =
    | 'loading'
    | 'password_required'
    | 'decrypting'
    | 'ready'
    | 'downloading'
    | 'error';

  const { data } = $props<{ data: { id: string } }>();
  // data.id is stable for the lifetime of this page (URL param)
  const shareId = $derived(data.id);

  let phase = $state<Phase>('loading');
  let errorMsg = $state('');
  let passwordInput = $state('');
  let wrongPassword = $state(false);

  // Fetched from manifest endpoint
  let manifestResponse = $state<DownloadManifestResponse | null>(null);

  // Decrypted
  let manifest = $state<Manifest | null>(null);
  let masterKey = $state<CryptoKey | null>(null);

  function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  }

  async function fetchManifest(): Promise<void> {
    const res = await fetch(`/api/v1/download/${shareId}/manifest`);
    if (res.status === 404) { phase = 'error'; errorMsg = $_('download.not_found'); return; }
    if (res.status === 410) {
      const body = (await res.json()) as { error: string };
      phase = 'error';
      errorMsg = body.error.includes('expired') ? $_('download.expired') : $_('download.exhausted');
      return;
    }
    if (!res.ok) { phase = 'error'; errorMsg = $_('download.not_found'); return; }

    manifestResponse = (await res.json()) as DownloadManifestResponse;

    if (manifestResponse.passwordRequired) {
      phase = 'password_required';
    } else {
      await decryptWithFragmentKey();
    }
  }

  async function decryptWithFragmentKey(): Promise<void> {
    if (!manifestResponse) return;
    const fragment = window.location.hash.slice(1); // strip leading #
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
    const raw = JSON.parse(new TextDecoder().decode(plaintext)) as Manifest;

    if (raw.version !== 1) {
      phase = 'error';
      errorMsg = `Unknown manifest version: ${raw.version}`;
      return;
    }

    masterKey = key;
    manifest = raw;
    phase = 'ready';
  }

  async function downloadFile(fileIndex: number): Promise<void> {
    if (!manifest || !masterKey) return;
    const file = manifest.files[fileIndex];
    if (!file) return;

    phase = 'downloading';
    try {
      // Extract blob number from blobId e.g. "blob-0001" → 1
      const blobNum = parseInt(file.blobId.replace('blob-', ''), 10);
      const res = await fetch(`/api/v1/download/${shareId}/blob/${blobNum}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      // new Uint8Array(ArrayBuffer) → Uint8Array<ArrayBuffer> for WebCrypto BufferSource
      const ciphertext = new Uint8Array(await res.arrayBuffer());
      const iv = fromBase64url(file.iv);
      const plaintext = await decrypt(masterKey, iv, ciphertext);

      // Trigger browser download
      const blob = new Blob([plaintext], { type: file.mime });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = file.name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      phase = 'ready';
    } catch {
      phase = 'error';
      errorMsg = $_('download.error_decrypt');
    }
  }

  onMount(() => {
    void fetchManifest();
  });
</script>

<header class="appbar">
  <a class="brand" href="/">
    <BrandMark size={28} />
    <span class="brand-text">ITSWEBER<span class="accent"> · Send</span></span>
  </a>
  <ThemeToggle />
</header>

<main class="page">
  <div class="card-wrap">
    {#if phase === 'loading'}
      <div class="card center-card">
        <span class="spinner" aria-hidden="true"></span>
        <p>{$_('download.loading')}</p>
      </div>

    {:else if phase === 'password_required'}
      <div class="card">
        <div class="lock-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"
               stroke-linecap="round" stroke-linejoin="round" width="36" height="36">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
            <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
          </svg>
        </div>
        <h2>{$_('download.password_required')}</h2>
        {#if wrongPassword}
          <p class="error-inline">{$_('download.wrong_password')}</p>
        {/if}
        <form onsubmit={(e) => { e.preventDefault(); void decryptWithPassword(); }}>
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

    {:else if phase === 'downloading'}
      <div class="card center-card">
        <span class="spinner" aria-hidden="true"></span>
        <p>{$_('download.downloading')}</p>
      </div>

    {:else if phase === 'ready' && manifest}
      <div class="card ready-card">
        <h2>{$_('download.ready_title')}</h2>
        <div class="file-list">
          {#each manifest.files as file, i}
            <div class="file-entry">
              <div class="file-info">
                <span class="file-name">{file.name}</span>
                <span class="file-meta">{formatBytes(file.size)} · {file.mime}</span>
              </div>
              <button class="btn-download" onclick={() => void downloadFile(i)}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"
                     stroke-linecap="round" stroke-linejoin="round" width="16" height="16">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                  <polyline points="7 10 12 15 17 10"/>
                  <line x1="12" y1="15" x2="12" y2="3"/>
                </svg>
                {$_('download.download_button')}
              </button>
            </div>
          {/each}
        </div>
        {#if manifestResponse?.remainingDownloads !== null && manifestResponse?.remainingDownloads !== undefined}
          <p class="remaining-note">
            Verbleibende Downloads: {manifestResponse.remainingDownloads}
          </p>
        {/if}
        <p class="encrypted-note">{$_('download.encrypted_note')}</p>
      </div>

    {:else if phase === 'error'}
      <div class="card error-card">
        <div class="error-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"
               stroke-linecap="round" stroke-linejoin="round" width="36" height="36">
            <circle cx="12" cy="12" r="10"/>
            <line x1="15" y1="9" x2="9" y2="15"/>
            <line x1="9" y1="9" x2="15" y2="15"/>
          </svg>
        </div>
        <p class="error-msg">{errorMsg}</p>
        <a class="btn-secondary" href="/">{$_('upload.new_upload')}</a>
      </div>
    {/if}
  </div>
</main>

<style>
  .appbar {
    position: sticky;
    top: 0;
    z-index: 30;
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 14px 28px;
    background: color-mix(in srgb, var(--surface) 85%, transparent);
    backdrop-filter: blur(14px);
    border-bottom: 1px solid var(--border);
  }
  .brand {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    color: var(--text);
    text-decoration: none;
    font-weight: 700;
    letter-spacing: -0.01em;
  }
  .accent { color: var(--brand); }

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
    box-shadow: 0 4px 20px rgba(0,0,0,0.06);
  }

  .center-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 16px;
    color: var(--muted);
    font-size: 15px;
  }

  /* Lock / error icons */
  .lock-icon, .error-icon {
    display: inline-flex;
    padding: 14px;
    border-radius: 50%;
    margin-bottom: 8px;
  }
  .lock-icon { background: color-mix(in srgb, var(--brand) 12%, transparent); color: var(--brand); }
  .error-icon { background: color-mix(in srgb, #d9534f 12%, transparent); color: #d9534f; }

  h2 { margin: 0 0 16px; font-size: 20px; }

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
  .password-input:focus { outline: 2px solid var(--brand); outline-offset: 2px; }

  /* File list */
  .file-list {
    display: flex;
    flex-direction: column;
    gap: 10px;
    margin-bottom: 16px;
  }
  .file-entry {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 12px 14px;
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: 10px;
  }
  .file-info { min-width: 0; }
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
    color: #fff;
    border: none;
    border-radius: 8px;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    white-space: nowrap;
    flex-shrink: 0;
    transition: opacity 0.15s;
  }
  .btn-download:hover { opacity: 0.85; }

  .remaining-note { color: var(--muted); font-size: 12px; margin: 0 0 8px; }
  .encrypted-note { color: var(--dim); font-size: 12px; margin: 0; }

  /* Error card */
  .error-card { text-align: center; }
  .error-msg { color: var(--muted); font-size: 15px; margin: 0 0 20px; }

  /* Buttons */
  .btn-primary {
    width: 100%;
    padding: 12px 20px;
    background: var(--brand);
    color: #fff;
    border: none;
    border-radius: 10px;
    font-size: 15px;
    font-weight: 600;
    cursor: pointer;
    transition: opacity 0.15s;
  }
  .btn-primary:disabled { opacity: 0.55; cursor: not-allowed; }
  .btn-primary:not(:disabled):hover { opacity: 0.88; }

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
  .btn-secondary:hover { background: var(--surface-3); }

  /* Spinner */
  .spinner {
    display: inline-block;
    width: 22px;
    height: 22px;
    border: 2px solid var(--border);
    border-top-color: var(--brand);
    border-radius: 50%;
    animation: spin 0.7s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }
</style>
