<script lang="ts">
  import { _ } from 'svelte-i18n';
  import { toCanvas as qrToCanvas } from 'qrcode';
  import Upload from '$lib/components/icons/Upload.svelte';
  import Lock from '$lib/components/icons/Lock.svelte';
  import Folder from '$lib/components/icons/Folder.svelte';
  import Plus from '$lib/components/icons/Plus.svelte';
  import X from '$lib/components/icons/X.svelte';
  import Pause from '$lib/components/icons/Pause.svelte';
  import ShieldCheck from '$lib/components/icons/ShieldCheck.svelte';
  import Mail from '$lib/components/icons/Mail.svelte';
  import QrCode from '$lib/components/icons/QrCode.svelte';
  import Eye from '$lib/components/icons/Eye.svelte';
  import EyeOff from '$lib/components/icons/EyeOff.svelte';
  import Check from '$lib/components/icons/Check.svelte';
  import { uploadFiles } from '$lib/upload/client.js';
  import { wordCodeFromId } from '$lib/share/wordcode.js';

  type FilePhase = 'queued' | 'encrypting' | 'encrypted' | 'uploading' | 'done';
  type Phase = 'idle' | 'encrypting' | 'uploading' | 'done' | 'error';

  let phase = $state<Phase>('idle');
  let selectedFiles = $state<File[]>([]);
  let filePhases = $state<FilePhase[]>([]);
  let isDragOver = $state(false);

  // Settings
  let expiryHours = $state(24);
  let downloadLimit = $state(5);
  let usePassword = $state(false);
  let password = $state('');
  let showPassword = $state(false);
  let useWordcode = $state(true);
  let useNotify = $state(false);
  let note = $state('');

  // Progress
  let uploadProgress = $state(0);

  // Result
  let shareUrl = $state('');
  let shareId = $state('');
  let wordCode = $state('');
  let shareExpiresAt = $state('');
  let errorMsg = $state('');
  let copiedField = $state<'link' | 'word' | ''>('');
  let qrCanvas: HTMLCanvasElement | undefined = $state();

  $effect(() => {
    if (qrCanvas && shareUrl) {
      void qrToCanvas(qrCanvas, shareUrl, {
        width: 160,
        margin: 1,
        color: { dark: '#0a1a26', light: '#ffffff' },
      });
    }
  });

  function addFiles(incoming: FileList | null) {
    if (!incoming) return;
    const next = Array.from(incoming);
    const existing = new Set(selectedFiles.map((f) => `${f.name}|${f.size}`));
    const toAdd = next.filter((f) => !existing.has(`${f.name}|${f.size}`));
    selectedFiles = [...selectedFiles, ...toAdd];
    filePhases = [...filePhases, ...toAdd.map(() => 'queued' as FilePhase)];
  }

  function removeFile(index: number) {
    selectedFiles = selectedFiles.filter((_, i) => i !== index);
    filePhases = filePhases.filter((_, i) => i !== index);
  }

  function onDragOver(e: DragEvent) {
    e.preventDefault();
    isDragOver = true;
  }
  function onDragLeave(e: DragEvent) {
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
  function openPicker() {
    (document.getElementById('file-input') as HTMLInputElement | null)?.click();
  }

  function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
    return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
  }
  function formatExpiry(iso: string): string {
    if (!iso) return '';
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }
  function fileTypeBadge(name: string, mime: string): { label: string; tone: 'pdf' | 'img' | 'zip' | 'doc' | 'def' } {
    const ext = (name.split('.').pop() || '').toLowerCase();
    if (ext === 'pdf') return { label: 'PDF', tone: 'pdf' };
    if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'avif', 'svg', 'heic'].includes(ext)) return { label: ext.toUpperCase(), tone: 'img' };
    if (['zip', 'tar', 'gz', '7z', 'rar'].includes(ext)) return { label: ext.toUpperCase(), tone: 'zip' };
    if (mime.startsWith('image/')) return { label: 'IMG', tone: 'img' };
    if (mime.startsWith('text/') || ['md', 'txt', 'doc', 'docx'].includes(ext)) return { label: ext.toUpperCase() || 'DOC', tone: 'doc' };
    return { label: (ext || 'FILE').slice(0, 4).toUpperCase(), tone: 'def' };
  }
  const totalSelectedBytes = $derived(selectedFiles.reduce((s, f) => s + f.size, 0));

  async function startUpload() {
    if (selectedFiles.length === 0) return;
    errorMsg = '';
    uploadProgress = 0;
    phase = 'encrypting';
    filePhases = selectedFiles.map(() => 'queued');

    try {
      const result = await uploadFiles(selectedFiles, {
        expiryHours,
        downloadLimit,
        password: usePassword ? password : undefined,
        note: note.trim() || undefined,
        onEncryptingStep: (step, _total) => {
          // step is 1-based; mark step-1 encrypted, step encrypting
          filePhases = filePhases.map((p, i) => {
            if (i < step - 1) return 'encrypted';
            if (i === step - 1) return 'encrypting';
            return 'queued';
          });
        },
        onProgress: (p) => {
          uploadProgress = p;
          phase = 'uploading';
          filePhases = filePhases.map(() => 'uploading');
        },
      });
      shareId = result.id;
      shareUrl = `${window.location.origin}/d/${result.id}#k=${result.key}`;
      wordCode = await wordCodeFromId(result.id);
      shareExpiresAt = result.expiresAt;
      filePhases = filePhases.map(() => 'done');
      phase = 'done';
    } catch (e) {
      errorMsg = e instanceof Error ? e.message : 'Unbekannter Fehler';
      phase = 'error';
    }
  }

  async function copyToClipboard(value: string, kind: 'link' | 'word') {
    try {
      await navigator.clipboard.writeText(value);
      copiedField = kind;
      setTimeout(() => {
        if (copiedField === kind) copiedField = '';
      }, 1800);
    } catch {
      /* clipboard denied */
    }
  }

  function newUpload() {
    phase = 'idle';
    selectedFiles = [];
    filePhases = [];
    shareUrl = '';
    shareId = '';
    wordCode = '';
    shareExpiresAt = '';
    errorMsg = '';
    password = '';
    note = '';
    usePassword = false;
    showPassword = false;
    copiedField = '';
    uploadProgress = 0;
  }

  function downloadQrPng() {
    if (!qrCanvas) return;
    const link = document.createElement('a');
    link.download = `share-${shareId}.png`;
    link.href = qrCanvas.toDataURL('image/png');
    link.click();
  }
  function emailShare() {
    const subject = encodeURIComponent('Datei für dich');
    const body = encodeURIComponent(
      `Hi,\n\nhier ist dein verschlüsselter Share-Link:\n${shareUrl}\n\nDer Link verfällt automatisch.\n`,
    );
    window.location.href = `mailto:?subject=${subject}&body=${body}`;
  }

  const expiryChips = [
    { value: 1, label: '1 h' },
    { value: 24, label: '24 h' },
    { value: 24 * 7, label: '7 Tage' },
    { value: 24 * 30, label: '30 Tage' },
  ];
  const dlChips = [
    { value: 1, label: '1×' },
    { value: 5, label: '5×' },
    { value: 20, label: '20×' },
    { value: 0, label: '∞' },
  ];

  const remainingDownloadsLabel = $derived(downloadLimit === 0 ? '∞' : String(downloadLimit));

  // True when the share can be fully reconstructed from wordcode + password (voice-only sharing).
  const voiceShareReady = $derived(useWordcode && usePassword && password.length >= 4);
  const wordcodeNeedsPassword = $derived(useWordcode && !usePassword);
</script>

<main class="page">
  <section class="hero">
    <h1>{$_('home.title')}</h1>
    <p class="lede">{$_('home.lede')}</p>
    <div class="pill-row">
      <span class="pill"><span class="dot"></span>AES-256-GCM im Browser</span>
      <span class="pill">Bis 5 GB pro Datei</span>
      <span class="pill">Keine Registrierung nötig</span>
    </div>
  </section>

  <div class="bento">
    <!-- LEFT: Upload Panel -->
    <section class="panel">
      <div class="panel-h">
        <h2>Upload</h2>
        <span class="enc-pill"><Lock size={14} /> wird im Browser verschlüsselt</span>
      </div>
      <div class="panel-body">
        {#if phase === 'idle' || phase === 'error'}
          <!-- Drop zone -->
          <!-- svelte-ignore a11y_interactive_supports_focus -->
          <div
            class="dropzone"
            class:active={isDragOver}
            class:has-files={selectedFiles.length > 0}
            role="button"
            ondragover={onDragOver}
            ondragleave={onDragLeave}
            ondrop={onDrop}
            onclick={openPicker}
            onkeydown={(e) => e.key === 'Enter' && openPicker()}
            tabindex="0"
            aria-label="Dateien hochladen"
          >
            <Upload size={44} />
            <div class="title">Dateien hierher ziehen</div>
            <div class="sub">
              oder Ordner — Multi-Upload wird automatisch als ZIP gepackt
            </div>
            <div class="or">oder</div>
            <button type="button" class="btn btn-primary" onclick={(e) => { e.stopPropagation(); openPicker(); }}>
              <Folder size={16} />
              Dateien auswählen
            </button>
          </div>
        {/if}

        <input
          id="file-input"
          type="file"
          multiple
          class="visually-hidden"
          onchange={onFileInput}
        />

        {#if errorMsg}
          <div class="err-banner">{errorMsg}</div>
        {/if}

        <!-- File list -->
        {#if selectedFiles.length > 0}
          <div class="file-list">
            {#each selectedFiles as file, i}
              {@const badge = fileTypeBadge(file.name, file.type)}
              {@const fp = filePhases[i] ?? 'queued'}
              <div class="file-row" class:done={fp === 'encrypted' || fp === 'done'} class:active={fp === 'encrypting' || fp === 'uploading'}>
                <div class="file-icon" data-tone={badge.tone}>{badge.label}</div>
                <div class="file-meta">
                  <div class="file-name" title={file.name}>{file.name}</div>
                  <div class="file-sub">
                    <span>{formatBytes(file.size)}</span>
                    {#if fp === 'queued'}
                      <span class="badge badge-queue">Warteschlange</span>
                    {:else if fp === 'encrypting'}
                      <span class="badge badge-busy">Verschlüsselt</span>
                    {:else if fp === 'encrypted'}
                      <span class="badge badge-ok"><Check size={10} /> Verschlüsselt</span>
                    {:else if fp === 'uploading'}
                      <span class="badge badge-busy">Lädt {Math.round(uploadProgress * 100)}%</span>
                    {:else if fp === 'done'}
                      <span class="badge badge-ok"><Check size={10} /> Übertragen</span>
                    {/if}
                  </div>
                  {#if fp === 'uploading'}
                    <div class="progress"><span style="width: {Math.round(uploadProgress * 100)}%"></span></div>
                  {/if}
                </div>
                <div class="file-actions">
                  {#if phase === 'idle' || phase === 'error'}
                    <button type="button" title="Entfernen" aria-label="Entfernen" onclick={() => removeFile(i)}>
                      <X size={14} />
                    </button>
                  {:else if fp === 'uploading'}
                    <button type="button" title="Pause" aria-label="Pause" disabled>
                      <Pause size={14} />
                    </button>
                  {/if}
                </div>
              </div>
            {/each}
          </div>

          {#if phase === 'idle' || phase === 'error'}
            <button class="btn-add" type="button" onclick={openPicker}>
              <Plus size={14} /> Weitere Dateien
            </button>
          {/if}
        {/if}

        <!-- Result card after success -->
        {#if phase === 'done'}
          <div class="result">
            <h3><span class="ico"><ShieldCheck size={20} /></span> Bereit zum Teilen</h3>
            <p class="subtitle">
              {selectedFiles.length === 1 ? selectedFiles[0]!.name : `${selectedFiles.length} Dateien`}
              · läuft ab am {formatExpiry(shareExpiresAt)}
            </p>

            {#if voiceShareReady}
              <div class="voice-share">
                <div class="voice-head">
                  <span class="voice-badge">Per Sprache teilen</span>
                  <span class="voice-hint">Code + Passwort reichen — vollständig per Telefon diktierbar.</span>
                </div>
                <div class="voice-grid">
                  <div class="field accent">
                    <div class="field-stack">
                      <div class="label">4-Wort-Code</div>
                      <div class="val val-lg">{wordCode}</div>
                    </div>
                    <button class="copy-btn" type="button" onclick={() => copyToClipboard(wordCode, 'word')}>
                      {copiedField === 'word' ? 'Kopiert' : 'Kopieren'}
                    </button>
                  </div>
                  <div class="field accent">
                    <div class="field-stack">
                      <div class="label">Passwort</div>
                      <div class="val val-lg">{showPassword ? password : '•'.repeat(Math.min(password.length, 12))}</div>
                    </div>
                    <button class="copy-btn ghost" type="button" onclick={() => (showPassword = !showPassword)}>
                      {showPassword ? 'Verbergen' : 'Anzeigen'}
                    </button>
                  </div>
                </div>
              </div>
            {/if}

            <div class="share-grid">
              <div class="qr">
                <canvas bind:this={qrCanvas} width="160" height="160" aria-label="QR-Code"></canvas>
              </div>
              <div class="share-fields">
                <div class="field">
                  <div class="field-stack">
                    <div class="label">Sharing-Link {voiceShareReady ? '(Alternative)' : ''}</div>
                    <div class="val" title={shareUrl}>{shareUrl}</div>
                  </div>
                  <button class="copy-btn" type="button" onclick={() => copyToClipboard(shareUrl, 'link')}>
                    {copiedField === 'link' ? 'Kopiert' : 'Kopieren'}
                  </button>
                </div>
                {#if useWordcode && !voiceShareReady}
                  <div class="field">
                    <div class="field-stack">
                      <div class="label">4-Wort-Code <span class="lookup-tag">nur Lookup</span></div>
                      <div class="val">{wordCode}</div>
                    </div>
                    <button class="copy-btn" type="button" onclick={() => copyToClipboard(wordCode, 'word')}>
                      {copiedField === 'word' ? 'Kopiert' : 'Kopieren'}
                    </button>
                  </div>
                  <p class="lookup-warn">
                    Der Code findet diesen Share, kann ihn aber nicht entschlüsseln. Sende dem Empfänger zusätzlich die volle URL oder
                    setze ein Passwort, um nur Code + Passwort weiterzugeben.
                  </p>
                {/if}
                {#if usePassword && password && !voiceShareReady}
                  <div class="field">
                    <div class="field-stack">
                      <div class="label">Passwort</div>
                      <div class="val">{showPassword ? password : '•'.repeat(Math.min(password.length, 12))}</div>
                    </div>
                    <button class="copy-btn ghost" type="button" onclick={() => (showPassword = !showPassword)}>
                      {showPassword ? 'Verbergen' : 'Anzeigen'}
                    </button>
                  </div>
                {/if}
              </div>
            </div>

            <div class="meta-row">
              <span><b>{remainingDownloadsLabel}</b> Downloads übrig</span>
              <span>Ablauf: <b>{formatExpiry(shareExpiresAt)}</b></span>
              <span><b>{formatBytes(totalSelectedBytes)}</b> · {selectedFiles.length} {selectedFiles.length === 1 ? 'Datei' : 'Dateien'}</span>
              <span class="meta-actions">
                <button type="button" class="btn btn-ghost btn-sm" onclick={downloadQrPng}>
                  <QrCode size={14} /> QR speichern
                </button>
                <button type="button" class="btn btn-ghost btn-sm" onclick={emailShare}>
                  <Mail size={14} /> Als E-Mail
                </button>
              </span>
            </div>

            <button type="button" class="new-upload" onclick={newUpload}>Neuer Upload</button>
          </div>
        {/if}

        {#if (phase === 'idle' || phase === 'error') && selectedFiles.length > 0}
          <button
            class="btn btn-primary upload-btn"
            type="button"
            disabled={selectedFiles.length === 0}
            onclick={startUpload}
          >
            <Lock size={16} /> Verschlüsseln &amp; hochladen
          </button>
        {/if}
      </div>
    </section>

    <!-- RIGHT: Settings Panel -->
    <aside class="panel">
      <div class="panel-h">
        <h2>Einstellungen</h2>
        <span class="hint-pill">gilt für diesen Upload</span>
      </div>
      <div class="panel-body settings-body">
        <div class="opt">
          <div class="opt-label">
            <span>Ablaufzeit</span>
            <span class="hint">max. 30 Tage</span>
          </div>
          <div class="opt-control">
            {#each expiryChips as chip}
              <button
                type="button"
                class="chip"
                class:active={expiryHours === chip.value}
                onclick={() => (expiryHours = chip.value)}
              >
                {chip.label}
              </button>
            {/each}
          </div>
        </div>

        <div class="opt">
          <div class="opt-label">
            <span>Download-Limit</span>
            <span class="hint">Self-destruct nach Downloads</span>
          </div>
          <div class="opt-control">
            {#each dlChips as chip}
              <button
                type="button"
                class="chip"
                class:active={downloadLimit === chip.value}
                onclick={() => (downloadLimit = chip.value)}
              >
                {chip.label}
              </button>
            {/each}
          </div>
        </div>

        <div class="opt">
          <div class="opt-label">
            <span>Passwortschutz</span>
            <button
              type="button"
              class="switch"
              class:on={usePassword}
              role="switch"
              aria-checked={usePassword}
              aria-label="Passwortschutz aktivieren"
              onclick={() => (usePassword = !usePassword)}
            >
              <span class="switch-track"></span>
            </button>
          </div>
          {#if usePassword}
            <div class="pw-row">
              <input
                type={showPassword ? 'text' : 'password'}
                class="input"
                placeholder="Passwort eingeben"
                bind:value={password}
                autocomplete="new-password"
              />
              <button
                type="button"
                class="ico-btn"
                onclick={() => (showPassword = !showPassword)}
                aria-label={showPassword ? 'Verbergen' : 'Anzeigen'}
                title={showPassword ? 'Verbergen' : 'Anzeigen'}
              >
                {#if showPassword}<EyeOff size={16} />{:else}<Eye size={16} />{/if}
              </button>
            </div>
            <span class="hint-line">Wird zusätzlich zur URL-Verschlüsselung genutzt</span>
          {/if}
        </div>

        <div class="opt">
          <div class="opt-label">
            <span>4-Wort-Code generieren</span>
            <button
              type="button"
              class="switch"
              class:on={useWordcode}
              role="switch"
              aria-checked={useWordcode}
              aria-label="4-Wort-Code generieren"
              onclick={() => (useWordcode = !useWordcode)}
            >
              <span class="switch-track"></span>
            </button>
          </div>
          {#if voiceShareReady}
            <span class="hint-line ok">Per Sprache übertragbar: Code + Passwort entschlüsseln den Share vollständig.</span>
          {:else if wordcodeNeedsPassword}
            <span class="hint-line warn">
              Ohne Passwort dient der Code nur als Kurzlink — der Empfänger braucht zusätzlich die volle URL mit Schlüssel.
              Empfehlung: Passwortschutz aktivieren, um den Share allein per Stimme weiterzugeben.
            </span>
          {:else}
            <span class="hint-line">Alternative zum langen Link, leichter zu diktieren.</span>
          {/if}
        </div>

        <div class="opt">
          <div class="opt-label">
            <span>Notiz an Empfänger</span>
            <span class="hint">verschlüsselt mit</span>
          </div>
          <textarea
            class="input"
            rows="3"
            placeholder="Optional: Markdown-Text …"
            bind:value={note}
            maxlength="500"
          ></textarea>
        </div>

        <div class="opt">
          <div class="opt-label">
            <span>Empfänger-Notification</span>
            <button
              type="button"
              class="switch"
              class:on={useNotify}
              role="switch"
              aria-checked={useNotify}
              aria-label="Empfänger benachrichtigen"
              onclick={() => (useNotify = !useNotify)}
              disabled
            >
              <span class="switch-track"></span>
            </button>
          </div>
          <span class="hint-line">Per E-Mail benachrichtigen, wenn heruntergeladen wurde (nur mit Account)</span>
        </div>
      </div>
    </aside>
  </div>

  <p class="footnote">
    ITSWEBER Send läuft in deinem Browser · keine Telemetrie · Open-Source unter
    <a href="https://github.com/itsweber/itsweber-send" target="_blank" rel="noopener noreferrer"
      >github.com/itsweber/itsweber-send</a
    >
  </p>
</main>

<style>
  .page {
    max-width: 1240px;
    margin: 0 auto;
    padding: 56px 28px 100px;
  }
  .hero {
    text-align: center;
    margin-bottom: 40px;
  }
  .hero h1 {
    font-size: clamp(32px, 5vw, 48px);
    margin: 0 0 12px;
    letter-spacing: -0.03em;
    line-height: 1.1;
  }
  .lede {
    color: var(--muted);
    margin: 0 auto;
    max-width: 580px;
    font-size: 17px;
    line-height: 1.5;
  }
  .pill-row {
    display: flex;
    gap: 8px;
    justify-content: center;
    margin-top: 20px;
    flex-wrap: wrap;
  }

  .bento {
    display: grid;
    gap: 16px;
    grid-template-columns: 1fr 380px;
    align-items: start;
  }
  @media (max-width: 980px) {
    .bento {
      grid-template-columns: 1fr;
    }
  }

  /* Pills inside panel header */
  .enc-pill {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 4px 12px;
    background: var(--brand-soft);
    color: var(--brand-strong);
    border-radius: 9999px;
    font-size: 12px;
    font-weight: 500;
  }
  :global([data-theme='dark']) .enc-pill {
    color: var(--brand);
  }
  @media (prefers-color-scheme: dark) {
    :global([data-theme='system']) .enc-pill {
      color: var(--brand);
    }
  }
  .hint-pill {
    color: var(--dim);
    font-size: 12px;
  }

  /* Drop zone */
  .dropzone {
    border: 2px dashed var(--border-strong);
    border-radius: var(--radius-lg);
    padding: 56px 24px;
    text-align: center;
    background: linear-gradient(180deg, var(--surface-2), transparent);
    cursor: pointer;
    transition:
      border-color var(--transition-base),
      background var(--transition-base),
      box-shadow var(--transition-base);
    color: var(--brand);
  }
  .dropzone:hover,
  .dropzone:focus-visible {
    border-color: var(--brand);
    background: linear-gradient(180deg, var(--brand-soft), transparent);
    outline: none;
  }
  .dropzone.active {
    border-color: var(--brand);
    background: var(--brand-soft);
    box-shadow: var(--shadow-glow);
  }
  .dropzone.has-files {
    padding: 28px 24px;
  }
  .dropzone .title {
    color: var(--text);
    font-size: 18px;
    font-weight: 600;
    margin-top: 10px;
    margin-bottom: 4px;
  }
  .dropzone .sub {
    color: var(--muted);
    font-size: 14px;
  }
  .dropzone .or {
    display: flex;
    align-items: center;
    gap: 12px;
    color: var(--dim);
    font-size: 12px;
    max-width: 240px;
    margin: 16px auto 8px;
  }
  .dropzone .or::before,
  .dropzone .or::after {
    content: '';
    flex: 1;
    height: 1px;
    background: var(--border);
  }

  /* Error banner */
  .err-banner {
    margin-top: 16px;
    padding: 12px 14px;
    background: color-mix(in srgb, var(--danger) 15%, transparent);
    color: var(--danger);
    border: 1px solid color-mix(in srgb, var(--danger) 25%, transparent);
    border-radius: var(--radius);
    font-size: 14px;
  }

  /* File list */
  .file-list {
    display: grid;
    gap: 10px;
    margin-top: 22px;
  }
  .file-row {
    display: grid;
    grid-template-columns: 36px 1fr auto;
    gap: 14px;
    align-items: center;
    padding: 12px 14px;
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    transition: border-color var(--transition-fast);
  }
  .file-row.active {
    border-color: var(--brand);
  }
  .file-icon {
    width: 36px;
    height: 36px;
    border-radius: 8px;
    background: var(--surface-3);
    color: var(--muted);
    display: grid;
    place-items: center;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.04em;
  }
  .file-icon[data-tone='pdf'] {
    background: color-mix(in srgb, var(--danger) 15%, var(--surface-3));
    color: var(--danger);
  }
  .file-icon[data-tone='img'] {
    background: color-mix(in srgb, var(--warning) 15%, var(--surface-3));
    color: var(--warning);
  }
  .file-icon[data-tone='zip'] {
    background: color-mix(in srgb, var(--brand) 15%, var(--surface-3));
    color: var(--brand);
  }
  .file-icon[data-tone='doc'] {
    background: color-mix(in srgb, var(--brand) 12%, var(--surface-3));
    color: var(--brand-strong);
  }
  .file-meta {
    min-width: 0;
  }
  .file-name {
    font-size: 14px;
    font-weight: 500;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .file-sub {
    font-size: 12px;
    color: var(--muted);
    margin-top: 2px;
    display: flex;
    gap: 10px;
    align-items: center;
    flex-wrap: wrap;
  }
  .progress {
    height: 4px;
    background: var(--surface-3);
    border-radius: 99px;
    overflow: hidden;
    margin-top: 8px;
  }
  .progress > span {
    display: block;
    height: 100%;
    background: var(--brand);
    border-radius: 99px;
    transition: width 0.3s;
  }
  .file-actions {
    display: flex;
    gap: 6px;
  }
  .file-actions button {
    width: 28px;
    height: 28px;
    border-radius: 6px;
    border: 1px solid var(--border);
    background: var(--surface);
    color: var(--muted);
    cursor: pointer;
    display: grid;
    place-items: center;
    font-family: inherit;
    transition: color var(--transition-fast), border-color var(--transition-fast);
  }
  .file-actions button:hover:not(:disabled) {
    color: var(--danger);
    border-color: color-mix(in srgb, var(--danger) 30%, var(--border));
  }
  .file-actions button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .btn-add {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    margin-top: 14px;
    padding: 6px 12px;
    background: transparent;
    border: 1px dashed var(--border);
    border-radius: var(--radius);
    color: var(--brand);
    font-size: 13px;
    cursor: pointer;
    transition: border-color var(--transition-fast), background var(--transition-fast);
    font-family: inherit;
  }
  .btn-add:hover {
    border-color: var(--brand);
    background: var(--brand-soft);
  }

  .upload-btn {
    width: 100%;
    margin-top: 22px;
    padding: 14px 20px;
    font-size: 15px;
    font-weight: 600;
    justify-content: center;
  }

  /* Settings */
  .settings-body {
    padding: 0 22px;
  }
  .opt {
    display: grid;
    gap: 8px;
    padding: 16px 0;
    border-bottom: 1px solid var(--border);
  }
  .opt:last-child {
    border-bottom: 0;
  }
  .opt-label {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 14px;
    color: var(--text);
  }
  .opt-label .hint {
    font-size: 12px;
    color: var(--dim);
    font-weight: 400;
  }
  .opt-control {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
  }
  .hint-line {
    font-size: 12px;
    color: var(--dim);
    line-height: 1.5;
  }
  .hint-line.warn {
    color: var(--warning, #b45309);
    background: color-mix(in srgb, var(--warning, #f59e0b) 10%, transparent);
    border: 1px solid color-mix(in srgb, var(--warning, #f59e0b) 25%, var(--border));
    border-radius: var(--radius-sm);
    padding: 8px 10px;
  }
  .hint-line.ok {
    color: var(--brand-strong);
    background: var(--brand-soft);
    border: 1px solid color-mix(in srgb, var(--brand) 25%, var(--border));
    border-radius: var(--radius-sm);
    padding: 8px 10px;
  }
  :global([data-theme='dark']) .hint-line.ok { color: var(--brand); }

  /* Switch */
  .switch {
    position: relative;
    display: inline-block;
    width: 36px;
    height: 20px;
    background: transparent;
    border: 0;
    padding: 0;
    cursor: pointer;
  }
  .switch:disabled {
    cursor: not-allowed;
    opacity: 0.5;
  }
  .switch-track {
    position: absolute;
    inset: 0;
    background: var(--surface-3);
    border-radius: 9999px;
    transition: background var(--transition-fast);
  }
  .switch-track::after {
    content: '';
    position: absolute;
    top: 2px;
    left: 2px;
    width: 16px;
    height: 16px;
    background: white;
    border-radius: 50%;
    transition: transform var(--transition-fast);
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.2);
  }
  .switch.on .switch-track {
    background: var(--brand);
  }
  .switch.on .switch-track::after {
    transform: translateX(16px);
  }

  /* Password row with eye toggle */
  .pw-row {
    display: flex;
    gap: 6px;
    align-items: stretch;
  }
  .pw-row .input {
    flex: 1;
  }
  .ico-btn {
    width: 38px;
    border: 1px solid var(--border);
    background: var(--surface-2);
    border-radius: var(--radius);
    color: var(--muted);
    cursor: pointer;
    display: grid;
    place-items: center;
  }
  .ico-btn:hover {
    color: var(--text);
  }

  /* Result card */
  .result {
    margin-top: 24px;
    padding: 28px;
    border-radius: var(--radius-lg);
    background:
      radial-gradient(80% 100% at 100% 0%, var(--brand-soft), transparent 60%),
      var(--surface);
    border: 1px solid var(--border);
    box-shadow: var(--shadow-glow);
  }
  .result h3 {
    margin: 0 0 6px;
    font-size: 20px;
    letter-spacing: -0.01em;
    display: inline-flex;
    align-items: center;
    gap: 8px;
  }
  .result .ico {
    color: var(--brand);
    display: inline-flex;
  }
  .result .subtitle {
    color: var(--muted);
    font-size: 14px;
    margin: 0 0 20px;
  }
  .share-grid {
    display: grid;
    gap: 16px;
    grid-template-columns: 160px 1fr;
  }
  @media (max-width: 700px) {
    .share-grid {
      grid-template-columns: 1fr;
    }
  }
  .qr {
    background: white;
    padding: 8px;
    border-radius: var(--radius);
    border: 1px solid var(--border);
    display: grid;
    place-items: center;
    aspect-ratio: 1;
  }
  .share-fields {
    display: grid;
    gap: 12px;
    align-content: start;
  }
  .field {
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 10px 12px;
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .field .label {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--dim);
    margin-bottom: 2px;
  }
  .field .val {
    font-family: var(--font-mono);
    font-size: 13px;
    color: var(--text);
    flex: 1;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .field-stack {
    display: grid;
    gap: 1px;
    flex: 1;
    min-width: 0;
  }
  .copy-btn {
    background: var(--brand);
    color: #0a1a26;
    border: 0;
    padding: 6px 12px;
    border-radius: 8px;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    font-family: inherit;
    flex-shrink: 0;
  }
  .copy-btn.ghost {
    background: transparent;
    color: var(--muted);
    border: 1px solid var(--border);
  }
  .copy-btn.ghost:hover {
    color: var(--text);
    border-color: var(--border-strong);
  }

  /* Voice share box */
  .voice-share {
    margin-bottom: 16px;
    padding: 16px;
    border-radius: var(--radius);
    background: color-mix(in srgb, var(--brand) 8%, var(--surface));
    border: 1px solid color-mix(in srgb, var(--brand) 25%, var(--border));
  }
  .voice-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 8px;
    margin-bottom: 12px;
  }
  .voice-badge {
    display: inline-block;
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.07em;
    color: var(--brand-strong);
    background: var(--brand-soft);
    padding: 3px 10px;
    border-radius: 9999px;
  }
  :global([data-theme='dark']) .voice-badge { color: var(--brand); }
  .voice-hint {
    font-size: 12px;
    color: var(--muted);
  }
  .voice-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
  }
  @media (max-width: 700px) {
    .voice-grid { grid-template-columns: 1fr; }
  }
  .field.accent {
    background: var(--surface);
    border-color: color-mix(in srgb, var(--brand) 30%, var(--border));
  }
  .val-lg {
    font-size: 15px;
    font-weight: 600;
  }
  .lookup-tag {
    display: inline-block;
    margin-left: 6px;
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.05em;
    color: var(--warning, #b45309);
    background: color-mix(in srgb, var(--warning, #f59e0b) 15%, transparent);
    padding: 1px 6px;
    border-radius: 4px;
    text-transform: uppercase;
    vertical-align: middle;
  }
  .lookup-warn {
    margin: 4px 2px 0;
    font-size: 12px;
    line-height: 1.5;
    color: var(--muted);
  }
  .meta-row {
    display: flex;
    gap: 16px;
    flex-wrap: wrap;
    margin-top: 18px;
    padding-top: 18px;
    border-top: 1px solid var(--border);
    font-size: 13px;
    color: var(--muted);
    align-items: center;
  }
  .meta-row b {
    color: var(--text);
  }
  .meta-actions {
    margin-left: auto;
    display: flex;
    gap: 8px;
  }
  .new-upload {
    margin-top: 18px;
    padding: 8px 14px;
    background: transparent;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    color: var(--muted);
    cursor: pointer;
    font-family: inherit;
    font-size: 13px;
  }
  .new-upload:hover {
    color: var(--text);
    border-color: var(--border-strong);
  }

  .footnote {
    color: var(--dim);
    font-size: 12px;
    text-align: center;
    margin: 60px 0 0;
  }
  .footnote a {
    color: var(--brand);
  }

  .visually-hidden {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }

  @media (max-width: 480px) {
    .page {
      padding: 32px 16px 60px;
    }
    .dropzone {
      padding: 40px 16px;
    }
    .meta-row {
      font-size: 12px;
    }
  }
</style>
