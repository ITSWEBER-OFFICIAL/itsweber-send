<script lang="ts">
  import { _ } from 'svelte-i18n';
  import { toCanvas as qrToCanvas } from 'qrcode';
  import BrandMark from '$lib/components/BrandMark.svelte';
  import ThemeToggle from '$lib/components/ThemeToggle.svelte';
  import FileIcon from '$lib/components/icons/FileIcon.svelte';
  import { uploadFiles } from '$lib/upload/client.js';

  type Phase = 'idle' | 'encrypting' | 'uploading' | 'done' | 'error';

  let phase = $state<Phase>('idle');
  let selectedFiles = $state<File[]>([]);
  let isDragOver = $state(false);

  // Settings
  let expiryHours = $state(24);
  let downloadLimit = $state(5);
  let usePassword = $state(false);
  let password = $state('');
  let note = $state('');

  // Progress
  let uploadProgress = $state(0);
  let encryptingStep = $state(0);
  let encryptingTotal = $state(0);

  // Result
  let shareUrl = $state('');
  let shareExpiresAt = $state('');
  let errorMsg = $state('');
  let copiedLink = $state(false);
  let qrCanvas: HTMLCanvasElement | undefined = $state();

  $effect(() => {
    if (qrCanvas && shareUrl) {
      void qrToCanvas(qrCanvas, shareUrl, {
        width: 180,
        margin: 2,
        color: { dark: '#111111', light: '#ffffff' },
      });
    }
  });

  function addFiles(incoming: FileList | null) {
    if (!incoming) return;
    const next = Array.from(incoming);
    // Deduplicate by name+size
    const existing = new Set(selectedFiles.map((f) => `${f.name}|${f.size}`));
    for (const f of next) {
      if (!existing.has(`${f.name}|${f.size}`)) {
        selectedFiles = [...selectedFiles, f];
      }
    }
  }

  function removeFile(index: number) {
    selectedFiles = selectedFiles.filter((_, i) => i !== index);
  }

  function onDragOver(e: DragEvent) {
    e.preventDefault();
    isDragOver = true;
  }

  function onDragLeave(e: DragEvent) {
    // Only clear when leaving the drop zone itself, not a child element
    const related = e.relatedTarget as Node | null;
    if (related && (e.currentTarget as HTMLElement).contains(related)) return;
    isDragOver = false;
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    isDragOver = false;
    addFiles(e.dataTransfer?.files ?? null);
  }

  function onFileInput(e: Event) {
    addFiles((e.target as HTMLInputElement).files);
    (e.target as HTMLInputElement).value = '';
  }

  function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
    return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
  }

  async function startUpload() {
    if (selectedFiles.length === 0) return;
    errorMsg = '';
    uploadProgress = 0;
    encryptingStep = 0;
    encryptingTotal = selectedFiles.length;
    phase = 'encrypting';

    try {
      const result = await uploadFiles(selectedFiles, {
        expiryHours,
        downloadLimit,
        password: usePassword ? password : undefined,
        note: note.trim() || undefined,
        onEncryptingStep: (step, total) => {
          encryptingStep = step;
          encryptingTotal = total;
        },
        onProgress: (p) => {
          uploadProgress = p;
          phase = 'uploading';
        },
      });
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
    selectedFiles = [];
    shareUrl = '';
    shareExpiresAt = '';
    errorMsg = '';
    password = '';
    note = '';
    usePassword = false;
    copiedLink = false;
    uploadProgress = 0;
    encryptingStep = 0;
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
      <div class="card result-card">
        <div class="result-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"
               stroke-linecap="round" stroke-linejoin="round" width="40" height="40" aria-hidden="true">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
            <polyline points="22 4 12 14.01 9 11.01"/>
          </svg>
        </div>
        <h2>{$_('upload.result_title')}</h2>

        <p class="result-label">{$_('upload.result_link_label')}</p>
        <div class="link-row">
          <input class="link-input" type="text" readonly value={shareUrl} aria-label="Share URL" />
          <button class="btn-copy" onclick={copyLink}>
            {copiedLink ? $_('upload.copied') : $_('upload.copy_link')}
          </button>
        </div>

        <div class="qr-section">
          <p class="qr-label">{$_('upload.qr_label')}</p>
          <div class="qr-wrap">
            <canvas bind:this={qrCanvas} width="180" height="180" aria-label="QR-Code"></canvas>
          </div>
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

    {:else if phase === 'encrypting'}
      <div class="card center-card">
        <span class="spinner" aria-hidden="true"></span>
        <p>
          {$_('upload.encrypting_step', { values: { step: encryptingStep, total: encryptingTotal } })}
        </p>
      </div>

    {:else if phase === 'uploading'}
      <div class="card center-card">
        <p class="progress-label">{$_('upload.uploading')}</p>
        <div class="progress-bar-wrap" role="progressbar" aria-valuenow={Math.round(uploadProgress * 100)} aria-valuemin={0} aria-valuemax={100}>
          <div class="progress-bar" style="width: {Math.round(uploadProgress * 100)}%"></div>
        </div>
        <p class="progress-pct">{Math.round(uploadProgress * 100)}%</p>
      </div>

    {:else}
      <div class="card upload-card">
        <!-- Drop zone -->
        <!-- svelte-ignore a11y_interactive_supports_focus -->
        <div
          class="drop-zone"
          class:drag-over={isDragOver}
          class:has-files={selectedFiles.length > 0}
          role="button"
          ondragover={onDragOver}
          ondragleave={onDragLeave}
          ondrop={onDrop}
          onclick={() => (document.getElementById('file-input') as HTMLInputElement | null)?.click()}
          onkeydown={(e) => e.key === 'Enter' && (document.getElementById('file-input') as HTMLInputElement | null)?.click()}
          tabindex="0"
          aria-label="Dateien hochladen"
        >
          <svg class="drop-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor"
               stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"
               width="36" height="36" aria-hidden="true">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="17 8 12 3 7 8"/>
            <line x1="12" y1="3" x2="12" y2="15"/>
          </svg>
          <p class="drop-hint">
            {$_('upload.drop_hint')}
            <span class="browse-text">{$_('upload.browse')}</span>
          </p>
        </div>

        <input
          id="file-input"
          type="file"
          multiple
          class="visually-hidden"
          onchange={onFileInput}
        />

        <!-- File list -->
        {#if selectedFiles.length > 0}
          <ul class="file-list" aria-label="Ausgewählte Dateien">
            {#each selectedFiles as file, i}
              <li class="file-entry">
                <span class="file-entry-icon"><FileIcon size={15} /></span>
                <span class="file-entry-name" title={file.name}>{file.name}</span>
                <span class="file-entry-size">{formatBytes(file.size)}</span>
                <button
                  class="btn-remove"
                  onclick={() => removeFile(i)}
                  aria-label="{$_('upload.remove_file')}: {file.name}"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                       stroke-linecap="round" stroke-linejoin="round" width="13" height="13" aria-hidden="true">
                    <line x1="18" y1="6" x2="6" y2="18"/>
                    <line x1="6" y1="6" x2="18" y2="18"/>
                  </svg>
                </button>
              </li>
            {/each}
          </ul>
          <button
            class="btn-add-files"
            onclick={() => (document.getElementById('file-input') as HTMLInputElement | null)?.click()}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"
                 stroke-linecap="round" stroke-linejoin="round" width="14" height="14" aria-hidden="true">
              <line x1="12" y1="5" x2="12" y2="19"/>
              <line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            {$_('upload.add_files')}
          </button>
        {/if}

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

        <!-- Note textarea -->
        <div class="note-section">
          <label class="note-label" for="note-input">{$_('upload.note_label')}</label>
          <textarea
            id="note-input"
            class="note-input"
            rows="3"
            placeholder={$_('upload.note_placeholder')}
            bind:value={note}
            maxlength="500"
          ></textarea>
        </div>

        <!-- Upload button -->
        <button
          class="btn-primary"
          disabled={selectedFiles.length === 0}
          onclick={startUpload}
        >
          {$_('upload.button')}
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
    font-size: clamp(22px, 4vw, 36px);
    margin: 0 0 12px;
    letter-spacing: -0.03em;
    line-height: 1.15;
  }
  .lede {
    color: var(--muted);
    font-size: 15px;
    line-height: 1.6;
    margin: 0;
  }

  .card-wrap { width: 100%; }

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
    padding: 28px 20px;
    text-align: center;
    cursor: pointer;
    transition: border-color 0.15s, background 0.15s;
    outline: none;
    user-select: none;
    min-height: 80px;
  }
  .drop-zone:hover, .drop-zone:focus-visible {
    border-color: var(--brand);
    background: color-mix(in srgb, var(--brand) 5%, transparent);
  }
  .drop-zone.drag-over {
    border-color: var(--brand);
    background: color-mix(in srgb, var(--brand) 10%, transparent);
  }
  .drop-zone.has-files {
    padding: 18px 20px;
  }
  .drop-icon { color: var(--muted); margin-bottom: 10px; }
  .drop-hint { color: var(--muted); font-size: 14px; margin: 0; }
  .browse-text { color: var(--brand); text-decoration: underline; cursor: pointer; }

  /* File list */
  .file-list {
    list-style: none;
    margin: 14px 0 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .file-entry {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 10px;
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: 8px;
    font-size: 13px;
  }
  .file-entry-icon { color: var(--muted); flex-shrink: 0; }
  .file-entry-name {
    flex: 1;
    min-width: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    font-weight: 500;
  }
  .file-entry-size { color: var(--muted); white-space: nowrap; flex-shrink: 0; font-size: 12px; }
  .btn-remove {
    flex-shrink: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 22px;
    height: 22px;
    padding: 0;
    background: transparent;
    border: none;
    border-radius: 4px;
    color: var(--muted);
    cursor: pointer;
    transition: background 0.1s, color 0.1s;
  }
  .btn-remove:hover { background: color-mix(in srgb, #d9534f 15%, transparent); color: #d9534f; }

  .btn-add-files {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    margin-top: 10px;
    padding: 6px 12px;
    background: transparent;
    border: 1px dashed var(--border);
    border-radius: 7px;
    color: var(--brand);
    font-size: 13px;
    cursor: pointer;
    transition: background 0.15s, border-color 0.15s;
  }
  .btn-add-files:hover {
    background: color-mix(in srgb, var(--brand) 8%, transparent);
    border-color: var(--brand);
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

  /* Note */
  .note-section {
    margin-top: 18px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .note-label {
    font-size: 13px;
    color: var(--muted);
  }
  .note-input {
    width: 100%;
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: 8px;
    color: var(--text);
    font-size: 14px;
    padding: 8px 12px;
    box-sizing: border-box;
    resize: vertical;
    line-height: 1.5;
    font-family: inherit;
    min-height: 70px;
  }
  .note-input:focus { outline: 2px solid var(--brand); outline-offset: 2px; }

  /* Buttons */
  .btn-primary {
    width: 100%;
    margin-top: 20px;
    padding: 13px 20px;
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
    min-height: 48px;
  }
  .btn-primary:disabled { opacity: 0.45; cursor: not-allowed; }
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
    width: 26px;
    height: 26px;
    border: 2.5px solid var(--border);
    border-top-color: var(--brand);
    border-radius: 50%;
    animation: spin 0.7s linear infinite;
    flex-shrink: 0;
  }
  @keyframes spin { to { transform: rotate(360deg); } }

  /* Center card (encrypting/uploading) */
  .center-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 14px;
    color: var(--muted);
    font-size: 15px;
    padding: 48px 28px;
    text-align: center;
  }

  /* Progress bar */
  .progress-label { margin: 0; color: var(--text); font-size: 15px; font-weight: 500; }
  .progress-bar-wrap {
    width: 100%;
    height: 8px;
    background: var(--surface-2);
    border-radius: 99px;
    overflow: hidden;
  }
  .progress-bar {
    height: 100%;
    background: var(--brand);
    border-radius: 99px;
    transition: width 0.2s ease;
  }
  .progress-pct { margin: 0; color: var(--muted); font-size: 13px; font-variant-numeric: tabular-nums; }

  /* Result card */
  .result-card { text-align: center; }
  .result-icon {
    display: inline-flex;
    padding: 14px;
    background: color-mix(in srgb, var(--brand) 12%, transparent);
    border-radius: 50%;
    color: var(--brand);
    margin-bottom: 14px;
  }
  .result-card h2 { margin: 0 0 6px; font-size: 22px; }
  .result-label { color: var(--muted); font-size: 13px; margin: 0 0 10px; }
  .link-row {
    display: flex;
    gap: 8px;
    margin-bottom: 20px;
  }
  .link-input {
    flex: 1;
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: 8px;
    color: var(--text);
    font-size: 12px;
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
    min-width: 100px;
  }
  .btn-copy:hover { opacity: 0.85; }

  /* QR code */
  .qr-section {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    margin-bottom: 16px;
  }
  .qr-label { color: var(--muted); font-size: 12px; margin: 0; text-transform: uppercase; letter-spacing: 0.06em; }
  .qr-wrap {
    background: #ffffff;
    border-radius: 10px;
    padding: 8px;
    display: inline-block;
    line-height: 0;
    box-shadow: 0 2px 8px rgba(0,0,0,0.12);
  }

  .expiry-note { color: var(--dim); font-size: 12px; margin: 0 0 16px; }

  /* Error card */
  .error-card { text-align: center; }
  .error-card h2 { margin: 0 0 8px; color: var(--danger, #d9534f); }
  .error-msg { color: var(--muted); font-size: 14px; margin: 0 0 20px; }

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

  /* Mobile */
  @media (max-width: 480px) {
    .appbar { padding: 12px 16px; }
    .page { padding: 40px 16px 60px; }
    .card { padding: 20px 16px; }
    .hero { margin-bottom: 28px; }
    .setting-row { flex-wrap: wrap; gap: 8px; }
    .setting-row .setting-label { width: 100%; }
    .select { min-width: unset; width: 100%; }
    .link-row { flex-direction: column; }
    .btn-copy { min-width: unset; }
    .center-card { padding: 36px 16px; }
  }
</style>
