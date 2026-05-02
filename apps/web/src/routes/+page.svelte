<script lang="ts">
  import { _ } from 'svelte-i18n';
  import BrandMark from '$lib/components/BrandMark.svelte';
  import ThemeToggle from '$lib/components/ThemeToggle.svelte';
  import { uploadFile } from '$lib/upload/client.js';

  type Phase = 'idle' | 'encrypting' | 'uploading' | 'done' | 'error';

  let phase = $state<Phase>('idle');
  let selectedFile = $state<File | null>(null);
  let isDragOver = $state(false);

  // Settings
  let expiryHours = $state(24);
  let downloadLimit = $state(5);
  let usePassword = $state(false);
  let password = $state('');

  // Result
  let shareUrl = $state('');
  let shareExpiresAt = $state('');
  let errorMsg = $state('');
  let copiedLink = $state(false);

  function onDragOver(e: DragEvent) {
    e.preventDefault();
    isDragOver = true;
  }

  function onDragLeave() {
    isDragOver = false;
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    isDragOver = false;
    const file = e.dataTransfer?.files[0];
    if (file) selectedFile = file;
  }

  function onFileInput(e: Event) {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file) selectedFile = file;
  }

  function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  }

  async function startUpload() {
    if (!selectedFile) return;
    errorMsg = '';
    phase = 'encrypting';

    try {
      const result = await uploadFile(selectedFile, {
        expiryHours,
        downloadLimit,
        password: usePassword ? password : undefined,
      });
      phase = 'uploading';
      shareUrl = `${window.location.origin}/d/${result.id}#k=${result.key}`;
      shareExpiresAt = result.expiresAt;
      phase = 'done';
    } catch (e) {
      errorMsg = e instanceof Error ? e.message : 'Unbekannter Fehler';
      phase = 'error';
    }
  }

  async function copyLink() {
    await navigator.clipboard.writeText(shareUrl);
    copiedLink = true;
    setTimeout(() => { copiedLink = false; }, 2000);
  }

  function reset() {
    phase = 'idle';
    selectedFile = null;
    shareUrl = '';
    shareExpiresAt = '';
    errorMsg = '';
    password = '';
    usePassword = false;
    copiedLink = false;
  }

  const expiryOptions = [
    { value: 1, label: 'upload.expiry_1h' },
    { value: 24, label: 'upload.expiry_24h' },
    { value: 24 * 7, label: 'upload.expiry_7d' },
    { value: 24 * 30, label: 'upload.expiry_30d' },
  ] as const;

  const dlOptions = [
    { value: 1, label: 'upload.dl_1' },
    { value: 5, label: 'upload.dl_5' },
    { value: 20, label: 'upload.dl_20' },
    { value: 0, label: 'upload.dl_unlimited' },
  ] as const;


</script>

<header class="appbar">
  <a class="brand" href="/">
    <BrandMark size={28} />
    <span class="brand-text">ITSWEBER<span class="accent"> · Send</span></span>
  </a>
  <ThemeToggle />
</header>

<main class="page">
  <section class="hero">
    <h1>{$_('home.title')}</h1>
    <p class="lede">{$_('home.lede')}</p>
  </section>

  <div class="card-wrap">
    {#if phase === 'done'}
      <!-- Result card -->
      <div class="card result-card">
        <div class="result-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"
               stroke-linecap="round" stroke-linejoin="round" width="40" height="40">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
            <polyline points="22 4 12 14.01 9 11.01"/>
          </svg>
        </div>
        <h2>{$_('upload.result_title')}</h2>
        <p class="result-label">{$_('upload.result_link_label')}</p>
        <div class="link-row">
          <input class="link-input" type="text" readonly value={shareUrl} />
          <button class="btn-copy" onclick={copyLink}>
            {copiedLink ? $_('upload.copied') : $_('upload.copy_link')}
          </button>
        </div>
        {#if shareExpiresAt}
          <p class="expiry-note">
            Link läuft ab: {new Date(shareExpiresAt).toLocaleString()}
          </p>
        {/if}
        <button class="btn-secondary" onclick={reset}>{$_('upload.new_upload')}</button>
      </div>

    {:else if phase === 'error'}
      <div class="card error-card">
        <h2>{$_('upload.error_title')}</h2>
        <p class="error-msg">{errorMsg}</p>
        <button class="btn-primary" onclick={reset}>{$_('upload.new_upload')}</button>
      </div>

    {:else}
      <div class="card upload-card">
        <!-- Drop zone -->
        <!-- svelte-ignore a11y_interactive_supports_focus -->
        <div
          class="drop-zone"
          class:drag-over={isDragOver}
          class:has-file={selectedFile !== null}
          role="button"
          ondragover={onDragOver}
          ondragleave={onDragLeave}
          ondrop={onDrop}
          onclick={() => (document.getElementById('file-input') as HTMLInputElement | null)?.click()}
          onkeydown={(e) => e.key === 'Enter' && (document.getElementById('file-input') as HTMLInputElement | null)?.click()}
          tabindex="0"
          aria-label="Datei hochladen"
        >
          <svg class="drop-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor"
               stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"
               width="36" height="36">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="17 8 12 3 7 8"/>
            <line x1="12" y1="3" x2="12" y2="15"/>
          </svg>
          {#if selectedFile}
            <p class="file-name">{selectedFile.name}</p>
            <p class="file-size">{formatBytes(selectedFile.size)}</p>
          {:else}
            <p class="drop-hint">
              {$_('upload.drop_hint')}
              <span class="browse-text">{$_('upload.browse')}</span>
            </p>
          {/if}
        </div>

        <input
          id="file-input"
          type="file"
          class="visually-hidden"
          onchange={onFileInput}
        />

        <!-- Settings -->
        <div class="settings">
          <div class="setting-row">
            <label class="setting-label" for="expiry">{$_('upload.expiry_label')}</label>
            <select id="expiry" class="select" bind:value={expiryHours}>
              {#each expiryOptions as opt}
                <option value={opt.value}>{$_(opt.label)}</option>
              {/each}
            </select>
          </div>

          <div class="setting-row">
            <label class="setting-label" for="dl-limit">{$_('upload.dl_label')}</label>
            <select id="dl-limit" class="select" bind:value={downloadLimit}>
              {#each dlOptions as opt}
                <option value={opt.value}>{$_(opt.label)}</option>
              {/each}
            </select>
          </div>

          <div class="setting-row">
            <label class="setting-label toggle-label">
              <span>{$_('upload.password_label')}</span>
              <input type="checkbox" bind:checked={usePassword} class="toggle-input" />
              <span class="toggle-track" aria-hidden="true"></span>
            </label>
          </div>

          {#if usePassword}
            <input
              type="password"
              class="password-input"
              placeholder={$_('upload.password_placeholder')}
              bind:value={password}
              autocomplete="new-password"
            />
          {/if}
        </div>

        <!-- Upload button -->
        <button
          class="btn-primary"
          disabled={!selectedFile || phase === 'encrypting' || phase === 'uploading'}
          onclick={startUpload}
        >
          {#if phase === 'encrypting'}
            <span class="spinner" aria-hidden="true"></span>
            {$_('upload.encrypting')}
          {:else if phase === 'uploading'}
            <span class="spinner" aria-hidden="true"></span>
            {$_('upload.uploading')}
          {:else}
            {$_('upload.button')}
          {/if}
        </button>
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
    max-width: 600px;
    margin: 0 auto;
    padding: 60px 24px 80px;
  }

  .hero {
    text-align: center;
    margin-bottom: 40px;
  }
  .hero h1 {
    font-size: clamp(26px, 4vw, 38px);
    margin: 0 0 12px;
    letter-spacing: -0.03em;
    line-height: 1.1;
  }
  .lede {
    color: var(--muted);
    font-size: 16px;
    line-height: 1.6;
    margin: 0;
  }

  .card-wrap {
    width: 100%;
  }

  .card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 16px;
    padding: 28px;
    box-shadow: 0 4px 20px rgba(0,0,0,0.06);
  }

  /* Drop zone */
  .drop-zone {
    border: 1.5px dashed var(--border);
    border-radius: 10px;
    padding: 32px 20px;
    text-align: center;
    cursor: pointer;
    transition: border-color 0.15s, background 0.15s;
    outline: none;
    user-select: none;
  }
  .drop-zone:hover, .drop-zone:focus-visible {
    border-color: var(--brand);
    background: color-mix(in srgb, var(--brand) 5%, transparent);
  }
  .drop-zone.drag-over {
    border-color: var(--brand);
    background: color-mix(in srgb, var(--brand) 10%, transparent);
  }
  .drop-zone.has-file {
    border-style: solid;
    border-color: var(--brand);
  }
  .drop-icon {
    color: var(--muted);
    margin-bottom: 10px;
  }
  .drop-hint {
    color: var(--muted);
    font-size: 14px;
    margin: 0;
  }
  .browse-text {
    color: var(--brand);
    text-decoration: underline;
    cursor: pointer;
  }
  .file-name {
    font-weight: 600;
    font-size: 15px;
    margin: 0 0 4px;
    word-break: break-all;
  }
  .file-size {
    color: var(--muted);
    font-size: 13px;
    margin: 0;
  }

  /* Settings */
  .settings {
    margin-top: 20px;
    display: flex;
    flex-direction: column;
    gap: 14px;
  }
  .setting-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }
  .setting-label {
    font-size: 14px;
    color: var(--text);
    flex-shrink: 0;
  }
  .select {
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: 8px;
    color: var(--text);
    font-size: 14px;
    padding: 6px 10px;
    cursor: pointer;
    min-width: 130px;
  }
  .select:focus { outline: 2px solid var(--brand); outline-offset: 2px; }

  /* Toggle */
  .toggle-label {
    display: flex;
    align-items: center;
    gap: 10px;
    cursor: pointer;
    width: 100%;
    justify-content: space-between;
  }
  .toggle-input { display: none; }
  .toggle-track {
    display: inline-block;
    width: 38px;
    height: 22px;
    border-radius: 11px;
    background: var(--border);
    position: relative;
    transition: background 0.2s;
    flex-shrink: 0;
  }
  .toggle-track::after {
    content: '';
    position: absolute;
    top: 3px;
    left: 3px;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: white;
    transition: transform 0.2s;
  }
  .toggle-input:checked ~ .toggle-track { background: var(--brand); }
  .toggle-input:checked ~ .toggle-track::after { transform: translateX(16px); }

  .password-input {
    width: 100%;
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: 8px;
    color: var(--text);
    font-size: 14px;
    padding: 8px 12px;
    box-sizing: border-box;
  }
  .password-input:focus { outline: 2px solid var(--brand); outline-offset: 2px; }

  /* Buttons */
  .btn-primary {
    width: 100%;
    margin-top: 20px;
    padding: 12px 20px;
    background: var(--brand);
    color: #fff;
    border: none;
    border-radius: 10px;
    font-size: 15px;
    font-weight: 600;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    transition: opacity 0.15s;
  }
  .btn-primary:disabled { opacity: 0.55; cursor: not-allowed; }
  .btn-primary:not(:disabled):hover { opacity: 0.88; }

  .btn-secondary {
    margin-top: 16px;
    padding: 10px 18px;
    background: var(--surface-2);
    color: var(--text);
    border: 1px solid var(--border);
    border-radius: 10px;
    font-size: 14px;
    cursor: pointer;
    transition: background 0.15s;
  }
  .btn-secondary:hover { background: var(--surface-3); }

  /* Spinner */
  .spinner {
    display: inline-block;
    width: 14px;
    height: 14px;
    border: 2px solid rgba(255,255,255,0.4);
    border-top-color: #fff;
    border-radius: 50%;
    animation: spin 0.7s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }

  /* Result card */
  .result-card { text-align: center; }
  .result-icon {
    display: inline-flex;
    padding: 14px;
    background: color-mix(in srgb, var(--brand) 12%, transparent);
    border-radius: 50%;
    color: var(--brand);
    margin-bottom: 16px;
  }
  .result-card h2 { margin: 0 0 6px; font-size: 22px; }
  .result-label { color: var(--muted); font-size: 13px; margin: 0 0 10px; }
  .link-row {
    display: flex;
    gap: 8px;
    margin-bottom: 10px;
  }
  .link-input {
    flex: 1;
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: 8px;
    color: var(--text);
    font-size: 13px;
    padding: 8px 10px;
    min-width: 0;
    font-family: var(--font-mono);
  }
  .btn-copy {
    padding: 8px 14px;
    background: var(--brand);
    color: #fff;
    border: none;
    border-radius: 8px;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    white-space: nowrap;
    transition: opacity 0.15s;
  }
  .btn-copy:hover { opacity: 0.85; }
  .expiry-note { color: var(--dim); font-size: 12px; margin: 0 0 16px; }

  /* Error card */
  .error-card { text-align: center; }
  .error-card h2 { margin: 0 0 8px; color: var(--danger, #d9534f); }
  .error-msg { color: var(--muted); font-size: 14px; margin: 0 0 20px; }

  /* Accessibility */
  .visually-hidden {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0,0,0,0);
    white-space: nowrap;
    border: 0;
  }
</style>
