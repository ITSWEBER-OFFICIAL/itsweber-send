<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { auth } from '$lib/stores/auth.svelte.js';
  import Shield from '$lib/components/icons/Shield.svelte';
  import ShieldCheck from '$lib/components/icons/ShieldCheck.svelte';
  import Eye from '$lib/components/icons/Eye.svelte';
  import EyeOff from '$lib/components/icons/EyeOff.svelte';
  import Check from '$lib/components/icons/Check.svelte';
  import Copy from '$lib/components/icons/Copy.svelte';

  interface SecurityStatus {
    totpEnabled: boolean;
  }

  // -- Page state --
  let status = $state<SecurityStatus | null>(null);
  let loading = $state(true);
  let error = $state('');

  // -- Password change --
  let pwCurrent = $state('');
  let pwNew = $state('');
  let pwConfirm = $state('');
  let pwShowCurrent = $state(false);
  let pwShowNew = $state(false);
  let pwLoading = $state(false);
  let pwError = $state('');
  let pwSuccess = $state('');

  // -- 2FA setup --
  type TotpPhase = 'idle' | 'setup' | 'confirm';
  let totpPhase = $state<TotpPhase>('idle');
  let totpUri = $state('');
  let totpSecret = $state('');
  let totpCode = $state('');
  let totpLoading = $state(false);
  let totpError = $state('');
  let totpSuccess = $state('');
  let uriCopied = $state(false);
  let secretCopied = $state(false);

  async function load() {
    loading = true;
    error = '';
    try {
      const res = await fetch('/api/v1/account/security');
      if (res.status === 401) { await goto('/login'); return; }
      if (!res.ok) { error = 'Sicherheitseinstellungen konnten nicht geladen werden.'; return; }
      status = (await res.json()) as SecurityStatus;
    } catch {
      error = 'Netzwerkfehler beim Laden.';
    } finally {
      loading = false;
    }
  }

  // --- Password ---
  async function changePassword() {
    if (pwLoading) return;
    if (!pwCurrent || !pwNew || !pwConfirm) { pwError = 'Alle Felder sind erforderlich.'; return; }
    if (pwNew.length < 8) { pwError = 'Neues Passwort muss mindestens 8 Zeichen haben.'; return; }
    if (pwNew !== pwConfirm) { pwError = 'Passwörter stimmen nicht überein.'; return; }
    pwLoading = true;
    pwError = '';
    pwSuccess = '';
    try {
      const res = await fetch('/api/v1/account/security/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword: pwCurrent, newPassword: pwNew }),
      });
      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as { message?: string };
        pwError = json.message ?? 'Fehler beim Ändern des Passworts.';
        return;
      }
      pwSuccess = 'Passwort erfolgreich geändert.';
      pwCurrent = '';
      pwNew = '';
      pwConfirm = '';
      setTimeout(() => { pwSuccess = ''; }, 3500);
    } catch {
      pwError = 'Netzwerkfehler.';
    } finally {
      pwLoading = false;
    }
  }

  // --- 2FA ---
  async function start2faSetup() {
    totpLoading = true;
    totpError = '';
    try {
      const res = await fetch('/api/v1/account/security/2fa/setup', { method: 'POST' });
      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as { message?: string };
        totpError = json.message ?? 'Fehler beim Einrichten von 2FA.';
        return;
      }
      const json = (await res.json()) as { uri: string; secret: string };
      totpUri = json.uri;
      totpSecret = json.secret;
      totpPhase = 'setup';
    } catch {
      totpError = 'Netzwerkfehler.';
    } finally {
      totpLoading = false;
    }
  }

  async function confirm2fa() {
    if (!totpCode.trim()) { totpError = 'Bitte den Code eingeben.'; return; }
    totpLoading = true;
    totpError = '';
    try {
      const res = await fetch('/api/v1/account/security/2fa/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: totpCode.trim() }),
      });
      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as { message?: string };
        totpError = json.message ?? 'Ungültiger Code.';
        return;
      }
      if (status) status = { ...status, totpEnabled: true };
      totpPhase = 'idle';
      totpUri = '';
      totpSecret = '';
      totpCode = '';
      totpSuccess = '2FA erfolgreich aktiviert.';
      setTimeout(() => { totpSuccess = ''; }, 4000);
    } catch {
      totpError = 'Netzwerkfehler.';
    } finally {
      totpLoading = false;
    }
  }

  async function disable2fa() {
    if (!confirm('2FA wirklich deaktivieren? Dein Konto ist danach weniger geschützt.')) return;
    totpLoading = true;
    totpError = '';
    try {
      const res = await fetch('/api/v1/account/security/2fa', { method: 'DELETE' });
      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as { message?: string };
        totpError = json.message ?? 'Fehler beim Deaktivieren.';
        return;
      }
      if (status) status = { ...status, totpEnabled: false };
      totpPhase = 'idle';
    } catch {
      totpError = 'Netzwerkfehler.';
    } finally {
      totpLoading = false;
    }
  }

  function cancelSetup() {
    totpPhase = 'idle';
    totpUri = '';
    totpSecret = '';
    totpCode = '';
    totpError = '';
  }

  async function copyUri() {
    try {
      await navigator.clipboard.writeText(totpUri);
      uriCopied = true;
      setTimeout(() => { uriCopied = false; }, 2000);
    } catch { /* ignore */ }
  }

  async function copySecret() {
    try {
      await navigator.clipboard.writeText(totpSecret);
      secretCopied = true;
      setTimeout(() => { secretCopied = false; }, 2000);
    } catch { /* ignore */ }
  }

  const pwStrength = $derived.by(() => {
    if (!pwNew) return 0;
    let score = 0;
    if (pwNew.length >= 8) score++;
    if (pwNew.length >= 12) score++;
    if (/[A-Z]/.test(pwNew)) score++;
    if (/[0-9]/.test(pwNew)) score++;
    if (/[^a-zA-Z0-9]/.test(pwNew)) score++;
    return score;
  });

  const pwStrengthLabel = $derived(
    pwStrength === 0 ? '' :
    pwStrength <= 1 ? 'Schwach' :
    pwStrength <= 2 ? 'Mittel' :
    pwStrength <= 3 ? 'Gut' : 'Stark'
  );

  const pwStrengthTone = $derived(
    pwStrength <= 1 ? 'weak' :
    pwStrength <= 2 ? 'medium' :
    pwStrength <= 3 ? 'good' : 'strong'
  );

  onMount(() => {
    if (!auth.loaded) {
      const check = setInterval(() => {
        if (auth.loaded) {
          clearInterval(check);
          if (!auth.user) { void goto('/login'); return; }
          void load();
        }
      }, 50);
    } else {
      if (!auth.user) { void goto('/login'); return; }
      void load();
    }
  });
</script>

<div class="page">
  <div class="page-header">
    <div class="page-title-row">
      <Shield size={22} />
      <h1 class="page-title">Sicherheit</h1>
    </div>
  </div>

  {#if loading}
    <div class="center"><span class="spinner" aria-hidden="true"></span></div>
  {:else if error}
    <p class="msg-error">{error}</p>
  {:else if status}

    <!-- Password change -->
    <section class="panel">
      <div class="panel-head">
        <h2 class="panel-heading">Passwort ändern</h2>
      </div>
      <div class="panel-body">
        <form onsubmit={(e) => { e.preventDefault(); void changePassword(); }}>
          <div class="field">
            <label for="pw-current" class="label">Aktuelles Passwort <span class="req">*</span></label>
            <div class="pw-wrap">
              <input
                id="pw-current"
                type={pwShowCurrent ? 'text' : 'password'}
                class="input"
                bind:value={pwCurrent}
                autocomplete="current-password"
                required
              />
              <button
                type="button"
                class="eye-btn"
                onclick={() => { pwShowCurrent = !pwShowCurrent; }}
                aria-label={pwShowCurrent ? 'Passwort verbergen' : 'Passwort anzeigen'}
              >
                {#if pwShowCurrent}
                  <EyeOff size={15} />
                {:else}
                  <Eye size={15} />
                {/if}
              </button>
            </div>
          </div>
          <div class="field">
            <label for="pw-new" class="label">Neues Passwort <span class="req">*</span></label>
            <div class="pw-wrap">
              <input
                id="pw-new"
                type={pwShowNew ? 'text' : 'password'}
                class="input"
                bind:value={pwNew}
                autocomplete="new-password"
                minlength={8}
                required
              />
              <button
                type="button"
                class="eye-btn"
                onclick={() => { pwShowNew = !pwShowNew; }}
                aria-label={pwShowNew ? 'Passwort verbergen' : 'Passwort anzeigen'}
              >
                {#if pwShowNew}
                  <EyeOff size={15} />
                {:else}
                  <Eye size={15} />
                {/if}
              </button>
            </div>
            {#if pwNew}
              <div class="strength-row">
                <div class="strength-bar">
                  {#each [1,2,3,4,5] as i}
                    <div class="strength-seg" class:filled={pwStrength >= i} data-tone={pwStrength >= i ? pwStrengthTone : ''}></div>
                  {/each}
                </div>
                {#if pwStrengthLabel}
                  <span class="strength-label" data-tone={pwStrengthTone}>{pwStrengthLabel}</span>
                {/if}
              </div>
            {/if}
          </div>
          <div class="field">
            <label for="pw-confirm" class="label">Neues Passwort bestätigen <span class="req">*</span></label>
            <input
              id="pw-confirm"
              type="password"
              class="input"
              bind:value={pwConfirm}
              autocomplete="new-password"
              required
            />
          </div>

          {#if pwError}
            <p class="msg-error">{pwError}</p>
          {/if}
          {#if pwSuccess}
            <p class="msg-success"><Check size={14} /> {pwSuccess}</p>
          {/if}

          <button type="submit" class="btn-primary" disabled={pwLoading}>
            {pwLoading ? 'Speichert…' : 'Passwort ändern'}
          </button>
        </form>
      </div>
    </section>

    <!-- 2FA section -->
    <section class="panel">
      <div class="panel-head">
        <h2 class="panel-heading">Zwei-Faktor-Authentifizierung</h2>
        {#if status.totpEnabled}
          <span class="status-chip on">
            <ShieldCheck size={13} /> Aktiv
          </span>
        {:else}
          <span class="status-chip off">Inaktiv</span>
        {/if}
      </div>
      <div class="panel-body">
        {#if totpError}
          <p class="msg-error">{totpError}</p>
        {/if}
        {#if totpSuccess}
          <p class="msg-success"><Check size={14} /> {totpSuccess}</p>
        {/if}

        {#if !status.totpEnabled && totpPhase === 'idle'}
          <p class="body-text">
            Schütze dein Konto mit einem zweiten Faktor. Nach der Aktivierung benötigst du beim Anmelden zusätzlich ein Einmalpasswort (TOTP) aus einer Authenticator-App.
          </p>
          <button type="button" class="btn-primary" onclick={() => void start2faSetup()} disabled={totpLoading}>
            {totpLoading ? 'Wird vorbereitet…' : '2FA aktivieren'}
          </button>

        {:else if totpPhase === 'setup' || totpPhase === 'confirm'}
          <div class="totp-setup">
            <p class="setup-step">
              <strong>Schritt 1:</strong> Scanne die folgenden Daten in deiner Authenticator-App (z. B. Aegis, Google Authenticator, Bitwarden).
            </p>

            <div class="totp-field-group">
              <div class="totp-field">
                <span class="totp-field-label">otpauth:// URI</span>
                <div class="code-display">
                  <code class="code-text">{totpUri}</code>
                  <button type="button" class="btn-copy" onclick={() => void copyUri()} aria-label="URI kopieren" title="URI kopieren">
                    {#if uriCopied}<Check size={14} />{:else}<Copy size={14} />{/if}
                  </button>
                </div>
              </div>
              <div class="totp-field">
                <span class="totp-field-label">Secret (manuell eingeben)</span>
                <div class="code-display">
                  <code class="code-text secret">{totpSecret}</code>
                  <button type="button" class="btn-copy" onclick={() => void copySecret()} aria-label="Secret kopieren" title="Secret kopieren">
                    {#if secretCopied}<Check size={14} />{:else}<Copy size={14} />{/if}
                  </button>
                </div>
              </div>
            </div>

            <p class="setup-step">
              <strong>Schritt 2:</strong> Gib den 6-stelligen Code aus der App ein, um die Einrichtung abzuschliessen.
            </p>

            <form onsubmit={(e) => { e.preventDefault(); void confirm2fa(); }}>
              <div class="field code-field">
                <label for="totp-code" class="label">Authenticator-Code</label>
                <input
                  id="totp-code"
                  type="text"
                  class="input input-code"
                  bind:value={totpCode}
                  placeholder="000000"
                  maxlength={6}
                  inputmode="numeric"
                  pattern="[0-9]{6}"
                  autocomplete="one-time-code"
                  required
                />
              </div>
              <div class="form-actions">
                <button type="submit" class="btn-primary" disabled={totpLoading}>
                  {totpLoading ? 'Bestätige…' : 'Bestätigen'}
                </button>
                <button type="button" class="btn-ghost" onclick={cancelSetup}>Abbrechen</button>
              </div>
            </form>
          </div>

        {:else if status.totpEnabled}
          <p class="body-text">
            Zwei-Faktor-Authentifizierung ist aktiv. Beim Anmelden wirst du nach einem Code aus deiner Authenticator-App gefragt.
          </p>
          <button type="button" class="btn-danger-outline" onclick={() => void disable2fa()} disabled={totpLoading}>
            {totpLoading ? 'Deaktiviert…' : '2FA deaktivieren'}
          </button>
        {/if}
      </div>
    </section>
  {/if}
</div>

<style>
  .page {
    display: flex;
    flex-direction: column;
  }
  .page-header {
    display: flex;
    align-items: center;
    margin-bottom: 24px;
  }
  .page-title-row {
    display: flex;
    align-items: center;
    gap: 10px;
    color: var(--text);
  }
  .page-title {
    margin: 0;
    font-size: 22px;
    font-weight: 700;
    letter-spacing: -0.02em;
  }
  .center {
    display: flex;
    justify-content: center;
    padding: 80px;
  }
  .spinner {
    width: 26px;
    height: 26px;
    border: 2.5px solid var(--border);
    border-top-color: var(--brand);
    border-radius: 50%;
    animation: spin 0.7s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }

  .msg-error {
    color: var(--danger);
    background: color-mix(in srgb, var(--danger) 10%, var(--surface));
    border: 1px solid color-mix(in srgb, var(--danger) 25%, var(--border));
    border-radius: var(--radius);
    padding: 12px 16px;
    font-size: 14px;
    margin: 0 0 16px;
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .msg-success {
    color: var(--brand);
    background: color-mix(in srgb, var(--brand) 8%, var(--surface));
    border: 1px solid color-mix(in srgb, var(--brand) 25%, var(--border));
    border-radius: var(--radius);
    padding: 12px 16px;
    font-size: 14px;
    margin: 0 0 16px;
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .panel {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    box-shadow: var(--shadow-card);
    margin-bottom: 20px;
  }
  .panel-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 20px;
    border-bottom: 1px solid var(--border);
  }
  .panel-heading {
    margin: 0;
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0.07em;
    color: var(--muted);
    font-weight: 600;
  }
  .panel-body {
    padding: 20px;
  }

  /* Status chip */
  .status-chip {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 3px 10px;
    border-radius: 9999px;
    font-size: 12px;
    font-weight: 600;
  }
  .status-chip.on {
    background: color-mix(in srgb, var(--brand) 12%, var(--surface));
    color: var(--brand-strong, var(--brand));
    border: 1px solid color-mix(in srgb, var(--brand) 25%, var(--border));
  }
  .status-chip.off {
    background: var(--surface-2);
    color: var(--muted);
    border: 1px solid var(--border);
  }

  /* Form */
  .field {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-bottom: 16px;
  }
  .label {
    font-size: 13px;
    font-weight: 600;
    color: var(--text);
  }
  .req { color: var(--danger); }
  .input {
    width: 100%;
    max-width: 420px;
    padding: 9px 12px;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--surface-2);
    color: var(--text);
    font-size: 14px;
    font-family: inherit;
    outline: none;
    box-sizing: border-box;
    transition: border-color var(--transition-fast);
  }
  .input:focus {
    border-color: var(--brand);
  }
  .input-code {
    max-width: 140px;
    font-family: var(--font-mono);
    font-size: 18px;
    letter-spacing: 0.15em;
    text-align: center;
  }

  /* Password field with eye toggle */
  .pw-wrap {
    position: relative;
    max-width: 420px;
  }
  .pw-wrap .input {
    max-width: 100%;
    padding-right: 40px;
  }
  .eye-btn {
    position: absolute;
    right: 10px;
    top: 50%;
    transform: translateY(-50%);
    background: none;
    border: none;
    color: var(--muted);
    cursor: pointer;
    padding: 4px;
    display: grid;
    place-items: center;
    transition: color var(--transition-fast);
  }
  .eye-btn:hover { color: var(--text); }

  /* Password strength */
  .strength-row {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-top: 2px;
  }
  .strength-bar {
    display: flex;
    gap: 4px;
  }
  .strength-seg {
    width: 28px;
    height: 4px;
    border-radius: 2px;
    background: var(--surface-2);
    border: 1px solid var(--border);
    transition: background var(--transition-fast);
  }
  .strength-seg.filled[data-tone='weak']   { background: var(--danger); border-color: var(--danger); }
  .strength-seg.filled[data-tone='medium'] { background: color-mix(in srgb, var(--danger) 50%, var(--brand)); border-color: transparent; }
  .strength-seg.filled[data-tone='good']   { background: var(--brand); border-color: var(--brand); }
  .strength-seg.filled[data-tone='strong'] { background: var(--brand-strong, var(--brand)); border-color: transparent; }
  .strength-label {
    font-size: 11px;
    font-weight: 600;
  }
  .strength-label[data-tone='weak']   { color: var(--danger); }
  .strength-label[data-tone='medium'] { color: color-mix(in srgb, var(--danger) 50%, var(--brand)); }
  .strength-label[data-tone='good']   { color: var(--brand); }
  .strength-label[data-tone='strong'] { color: var(--brand-strong, var(--brand)); }

  /* 2FA setup */
  .body-text {
    font-size: 14px;
    color: var(--muted);
    margin: 0 0 18px;
    line-height: 1.55;
  }
  .totp-setup {
    display: flex;
    flex-direction: column;
    gap: 0;
  }
  .setup-step {
    font-size: 14px;
    color: var(--text);
    margin: 0 0 14px;
    line-height: 1.5;
  }
  .totp-field-group {
    display: flex;
    flex-direction: column;
    gap: 12px;
    margin-bottom: 22px;
  }
  .totp-field {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .totp-field-label {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--dim, var(--muted));
    font-weight: 600;
  }
  .code-display {
    display: flex;
    align-items: center;
    gap: 8px;
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    padding: 10px 12px;
    max-width: 520px;
  }
  .code-text {
    flex: 1;
    font-family: var(--font-mono);
    font-size: 12px;
    word-break: break-all;
    color: var(--text);
    line-height: 1.5;
  }
  .code-text.secret {
    font-size: 14px;
    letter-spacing: 0.06em;
    word-break: break-all;
  }
  .btn-copy {
    flex-shrink: 0;
    width: 28px;
    height: 28px;
    border-radius: var(--radius-sm);
    border: 1px solid var(--border);
    background: var(--surface);
    color: var(--muted);
    cursor: pointer;
    display: grid;
    place-items: center;
    transition: color var(--transition-fast);
  }
  .btn-copy:hover { color: var(--brand); }

  .code-field { margin-top: 4px; }
  .form-actions {
    display: flex;
    gap: 10px;
    align-items: center;
    flex-wrap: wrap;
  }

  /* Buttons */
  .btn-primary {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 9px 18px;
    background: var(--brand);
    color: var(--surface);
    border: none;
    border-radius: var(--radius-sm);
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    transition: opacity var(--transition-fast);
    font-family: inherit;
  }
  .btn-primary:hover:not(:disabled) { opacity: 0.88; }
  .btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }

  .btn-ghost {
    display: inline-flex;
    align-items: center;
    padding: 9px 14px;
    background: transparent;
    color: var(--muted);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    font-size: 13px;
    cursor: pointer;
    transition: color var(--transition-fast), border-color var(--transition-fast);
    font-family: inherit;
  }
  .btn-ghost:hover {
    color: var(--text);
    border-color: var(--border-strong, var(--border));
  }

  .btn-danger-outline {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 9px 18px;
    background: transparent;
    color: var(--danger);
    border: 1px solid color-mix(in srgb, var(--danger) 40%, var(--border));
    border-radius: var(--radius-sm);
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    transition: background var(--transition-fast), opacity var(--transition-fast);
    font-family: inherit;
  }
  .btn-danger-outline:hover:not(:disabled) {
    background: color-mix(in srgb, var(--danger) 8%, var(--surface));
  }
  .btn-danger-outline:disabled { opacity: 0.5; cursor: not-allowed; }
</style>
