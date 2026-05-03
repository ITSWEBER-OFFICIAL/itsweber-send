<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { _ } from 'svelte-i18n';
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

  // -- Recovery codes --
  let recoveryCodes = $state<string[] | null>(null);
  let recoveryRemaining = $state<number | null>(null);
  let recoveryLoading = $state(false);
  let recoveryError = $state('');
  let recoveryAcknowledged = $state(false);
  let recoveryCopied = $state(false);

  async function loadRecoveryStatus(): Promise<void> {
    try {
      const res = await fetch('/api/v1/account/security/2fa/recovery-codes');
      if (!res.ok) return;
      const json = (await res.json()) as { remaining: number };
      recoveryRemaining = json.remaining;
    } catch {
      /* non-fatal */
    }
  }

  async function generateRecoveryCodes(): Promise<void> {
    recoveryLoading = true;
    recoveryError = '';
    try {
      const res = await fetch('/api/v1/account/security/2fa/recovery-codes', { method: 'POST' });
      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as { error?: string };
        recoveryError = json.error ?? $_('account.security.recovery_error_generate');
        return;
      }
      const json = (await res.json()) as { codes: string[]; remaining: number };
      recoveryCodes = json.codes;
      recoveryRemaining = json.remaining;
      recoveryAcknowledged = false;
      recoveryCopied = false;
    } catch {
      recoveryError = $_('account.security.recovery_error_network');
    } finally {
      recoveryLoading = false;
    }
  }

  async function copyRecoveryCodes(): Promise<void> {
    if (!recoveryCodes) return;
    try {
      await navigator.clipboard.writeText(recoveryCodes.join('\n'));
      recoveryCopied = true;
      setTimeout(() => (recoveryCopied = false), 2000);
    } catch {
      /* clipboard denied */
    }
  }

  function downloadRecoveryCodes(): void {
    if (!recoveryCodes) return;
    const header = 'ITSWEBER Send — Recovery codes\n';
    const body = recoveryCodes.join('\n') + '\n';
    const blob = new Blob([header, body], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'itsweber-send-recovery-codes.txt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function dismissRecoveryCodes(): void {
    recoveryCodes = null;
    recoveryAcknowledged = false;
    recoveryCopied = false;
  }
  let uriCopied = $state(false);
  let secretCopied = $state(false);

  async function load() {
    loading = true;
    error = '';
    try {
      const res = await fetch('/api/v1/account/security');
      if (res.status === 401) {
        await goto('/login');
        return;
      }
      if (!res.ok) {
        error = $_('account.security.error_load');
        return;
      }
      status = (await res.json()) as SecurityStatus;
      if (status.totpEnabled) await loadRecoveryStatus();
    } catch {
      error = $_('account.security.error_network');
    } finally {
      loading = false;
    }
  }

  // --- Password ---
  async function changePassword() {
    if (pwLoading) return;
    if (!pwCurrent || !pwNew || !pwConfirm) {
      pwError = $_('account.security.pw_error_fields');
      return;
    }
    if (pwNew.length < 8) {
      pwError = $_('account.security.pw_error_length');
      return;
    }
    if (pwNew !== pwConfirm) {
      pwError = $_('account.security.pw_error_mismatch');
      return;
    }
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
        pwError = json.message ?? $_('account.security.pw_error_change');
        return;
      }
      pwSuccess = $_('account.security.pw_success');
      pwCurrent = '';
      pwNew = '';
      pwConfirm = '';
      setTimeout(() => {
        pwSuccess = '';
      }, 3500);
    } catch {
      pwError = $_('account.security.pw_error_network');
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
        totpError = json.message ?? $_('account.security.totp_error_setup');
        return;
      }
      const json = (await res.json()) as { uri: string; secret: string };
      totpUri = json.uri;
      totpSecret = json.secret;
      totpPhase = 'setup';
    } catch {
      totpError = $_('account.security.totp_error_network');
    } finally {
      totpLoading = false;
    }
  }

  async function confirm2fa() {
    if (!totpCode.trim()) {
      totpError = $_('account.security.totp_code_error');
      return;
    }
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
        totpError = json.message ?? $_('account.security.totp_code_invalid');
        return;
      }
      if (status) status = { ...status, totpEnabled: true };
      totpPhase = 'idle';
      totpUri = '';
      totpSecret = '';
      totpCode = '';
      totpSuccess = $_('account.security.totp_success');
      setTimeout(() => {
        totpSuccess = '';
      }, 4000);
    } catch {
      totpError = $_('account.security.totp_error_network');
    } finally {
      totpLoading = false;
    }
  }

  async function disable2fa() {
    if (!confirm($_('account.security.totp_disable_confirm'))) return;
    totpLoading = true;
    totpError = '';
    try {
      const res = await fetch('/api/v1/account/security/2fa', { method: 'DELETE' });
      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as { message?: string };
        totpError = json.message ?? $_('account.security.totp_error_disable');
        return;
      }
      if (status) status = { ...status, totpEnabled: false };
      totpPhase = 'idle';
    } catch {
      totpError = $_('account.security.totp_error_network');
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
      setTimeout(() => {
        uriCopied = false;
      }, 2000);
    } catch {
      /* ignore */
    }
  }

  async function copySecret() {
    try {
      await navigator.clipboard.writeText(totpSecret);
      secretCopied = true;
      setTimeout(() => {
        secretCopied = false;
      }, 2000);
    } catch {
      /* ignore */
    }
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
    pwStrength === 0
      ? ''
      : pwStrength <= 1
        ? $_('account.security.pw_strength_weak')
        : pwStrength <= 2
          ? $_('account.security.pw_strength_medium')
          : pwStrength <= 3
            ? $_('account.security.pw_strength_good')
            : $_('account.security.pw_strength_strong'),
  );

  const pwStrengthTone = $derived(
    pwStrength <= 1 ? 'weak' : pwStrength <= 2 ? 'medium' : pwStrength <= 3 ? 'good' : 'strong',
  );

  onMount(() => {
    if (!auth.loaded) {
      const check = setInterval(() => {
        if (auth.loaded) {
          clearInterval(check);
          if (!auth.user) {
            void goto('/login');
            return;
          }
          void load();
        }
      }, 50);
    } else {
      if (!auth.user) {
        void goto('/login');
        return;
      }
      void load();
    }
  });
</script>

<div class="page">
  <div class="page-header">
    <div class="page-title-row">
      <Shield size={22} />
      <h1 class="page-title">{$_('account.security.title')}</h1>
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
        <h2 class="panel-heading">{$_('account.security.pw_section')}</h2>
      </div>
      <div class="panel-body">
        <form
          onsubmit={(e) => {
            e.preventDefault();
            void changePassword();
          }}
        >
          <div class="field">
            <label for="pw-current" class="label"
              >{$_('account.security.pw_current')} <span class="req">*</span></label
            >
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
                onclick={() => {
                  pwShowCurrent = !pwShowCurrent;
                }}
                aria-label={pwShowCurrent
                  ? $_('account.security.pw_hide')
                  : $_('account.security.pw_show')}
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
            <label for="pw-new" class="label"
              >{$_('account.security.pw_new')} <span class="req">*</span></label
            >
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
                onclick={() => {
                  pwShowNew = !pwShowNew;
                }}
                aria-label={pwShowNew
                  ? $_('account.security.pw_hide')
                  : $_('account.security.pw_show')}
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
                  {#each [1, 2, 3, 4, 5] as i}
                    <div
                      class="strength-seg"
                      class:filled={pwStrength >= i}
                      data-tone={pwStrength >= i ? pwStrengthTone : ''}
                    ></div>
                  {/each}
                </div>
                {#if pwStrengthLabel}
                  <span class="strength-label" data-tone={pwStrengthTone}>{pwStrengthLabel}</span>
                {/if}
              </div>
            {/if}
          </div>
          <div class="field">
            <label for="pw-confirm" class="label"
              >{$_('account.security.pw_confirm')} <span class="req">*</span></label
            >
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
            {pwLoading ? $_('account.security.pw_saving') : $_('account.security.pw_save')}
          </button>
        </form>
      </div>
    </section>

    <!-- 2FA section -->
    <section class="panel">
      <div class="panel-head">
        <h2 class="panel-heading">{$_('account.security.totp_section')}</h2>
        {#if status.totpEnabled}
          <span class="status-chip on">
            <ShieldCheck size={13} />
            {$_('account.security.totp_active')}
          </span>
        {:else}
          <span class="status-chip off">{$_('account.security.totp_inactive')}</span>
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
            {$_('account.security.totp_desc')}
          </p>
          <button
            type="button"
            class="btn-primary"
            onclick={() => void start2faSetup()}
            disabled={totpLoading}
          >
            {totpLoading
              ? $_('account.security.totp_enabling')
              : $_('account.security.totp_enable')}
          </button>
        {:else if totpPhase === 'setup' || totpPhase === 'confirm'}
          <div class="totp-setup">
            <p class="setup-step">
              <strong>{$_('account.security.totp_step1')}</strong>
              {$_('account.security.totp_step1_desc')}
            </p>

            <div class="totp-field-group">
              <div class="totp-field">
                <span class="totp-field-label">otpauth:// URI</span>
                <div class="code-display">
                  <code class="code-text">{totpUri}</code>
                  <button
                    type="button"
                    class="btn-copy"
                    onclick={() => void copyUri()}
                    aria-label={$_('account.security.totp_copy_uri')}
                    title={$_('account.security.totp_copy_uri')}
                  >
                    {#if uriCopied}<Check size={14} />{:else}<Copy size={14} />{/if}
                  </button>
                </div>
              </div>
              <div class="totp-field">
                <span class="totp-field-label">Secret (manuell eingeben)</span>
                <div class="code-display">
                  <code class="code-text secret">{totpSecret}</code>
                  <button
                    type="button"
                    class="btn-copy"
                    onclick={() => void copySecret()}
                    aria-label={$_('account.security.totp_copy_secret')}
                    title={$_('account.security.totp_copy_secret')}
                  >
                    {#if secretCopied}<Check size={14} />{:else}<Copy size={14} />{/if}
                  </button>
                </div>
              </div>
            </div>

            <p class="setup-step">
              <strong>{$_('account.security.totp_step2')}</strong>
              {$_('account.security.totp_step2_desc')}
            </p>

            <form
              onsubmit={(e) => {
                e.preventDefault();
                void confirm2fa();
              }}
            >
              <div class="field code-field">
                <label for="totp-code" class="label">{$_('account.security.totp_code_label')}</label
                >
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
                  {totpLoading
                    ? $_('account.security.totp_confirming')
                    : $_('account.security.totp_confirm')}
                </button>
                <button type="button" class="btn-ghost" onclick={cancelSetup}
                  >{$_('account.security.totp_cancel')}</button
                >
              </div>
            </form>
          </div>
        {:else if status.totpEnabled}
          <p class="body-text">
            {$_('account.security.totp_active_desc')}
          </p>
          <button
            type="button"
            class="btn-danger-outline"
            onclick={() => void disable2fa()}
            disabled={totpLoading}
          >
            {totpLoading
              ? $_('account.security.totp_disabling')
              : $_('account.security.totp_disable')}
          </button>

          <hr class="recovery-divider" />

          <h3 class="subhead">{$_('account.security.recovery_heading')}</h3>
          <p class="body-text">
            {$_('account.security.recovery_desc')}
          </p>
          {#if recoveryCodes !== null}
            <div class="recovery-box">
              <div class="recovery-grid">
                {#each recoveryCodes as code (code)}
                  <code class="recovery-code">{code}</code>
                {/each}
              </div>
              <div class="recovery-actions">
                <button type="button" class="btn-ghost" onclick={copyRecoveryCodes}>
                  {recoveryCopied
                    ? $_('account.security.recovery_copied')
                    : $_('account.security.recovery_copy_all')}
                </button>
                <button type="button" class="btn-ghost" onclick={downloadRecoveryCodes}>
                  {$_('account.security.recovery_download_txt')}
                </button>
              </div>
              <label class="recovery-confirm">
                <input type="checkbox" bind:checked={recoveryAcknowledged} />
                {$_('account.security.recovery_acknowledge')}
              </label>
              <button
                type="button"
                class="btn-primary"
                disabled={!recoveryAcknowledged}
                onclick={dismissRecoveryCodes}
              >
                {$_('account.security.recovery_done')}
              </button>
            </div>
          {:else}
            <p class="body-text">
              {recoveryRemaining === null
                ? $_('account.security.recovery_loading_status')
                : $_('account.security.recovery_remaining', {
                    values: { count: recoveryRemaining },
                  })}
            </p>
            {#if recoveryError}
              <p class="error-inline">{recoveryError}</p>
            {/if}
            <button
              type="button"
              class="btn-ghost"
              onclick={() => void generateRecoveryCodes()}
              disabled={recoveryLoading}
            >
              {recoveryLoading
                ? $_('account.security.recovery_generating')
                : recoveryRemaining && recoveryRemaining > 0
                  ? $_('account.security.recovery_regenerate')
                  : $_('account.security.recovery_generate')}
            </button>
          {/if}
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
  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

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
  .req {
    color: var(--danger);
  }
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
  .eye-btn:hover {
    color: var(--text);
  }

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
  .strength-seg.filled[data-tone='weak'] {
    background: var(--danger);
    border-color: var(--danger);
  }
  .strength-seg.filled[data-tone='medium'] {
    background: color-mix(in srgb, var(--danger) 50%, var(--brand));
    border-color: transparent;
  }
  .strength-seg.filled[data-tone='good'] {
    background: var(--brand);
    border-color: var(--brand);
  }
  .strength-seg.filled[data-tone='strong'] {
    background: var(--brand-strong, var(--brand));
    border-color: transparent;
  }
  .strength-label {
    font-size: 11px;
    font-weight: 600;
  }
  .strength-label[data-tone='weak'] {
    color: var(--danger);
  }
  .strength-label[data-tone='medium'] {
    color: color-mix(in srgb, var(--danger) 50%, var(--brand));
  }
  .strength-label[data-tone='good'] {
    color: var(--brand);
  }
  .strength-label[data-tone='strong'] {
    color: var(--brand-strong, var(--brand));
  }

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
  .btn-copy:hover {
    color: var(--brand);
  }

  .code-field {
    margin-top: 4px;
  }
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
  .btn-primary:hover:not(:disabled) {
    opacity: 0.88;
  }
  .btn-primary:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

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
    transition:
      color var(--transition-fast),
      border-color var(--transition-fast);
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
    transition:
      background var(--transition-fast),
      opacity var(--transition-fast);
    font-family: inherit;
  }
  .btn-danger-outline:hover:not(:disabled) {
    background: color-mix(in srgb, var(--danger) 8%, var(--surface));
  }
  .btn-danger-outline:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .recovery-divider {
    margin: 24px 0 18px;
    border: 0;
    border-top: 1px solid var(--border);
  }
  .subhead {
    font-size: 15px;
    margin: 0 0 8px;
  }
  .recovery-box {
    display: flex;
    flex-direction: column;
    gap: 14px;
    margin-top: 12px;
    padding: 16px;
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
  }
  .recovery-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px 12px;
  }
  .recovery-code {
    font-family: var(--font-mono, ui-monospace, monospace);
    font-size: 14px;
    letter-spacing: 0.04em;
    padding: 6px 10px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-xs, 6px);
    user-select: all;
  }
  .recovery-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .recovery-confirm {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
    color: var(--muted, var(--text));
  }
  .error-inline {
    color: var(--danger);
    font-size: 13px;
    margin: 8px 0 0;
  }
  @media (max-width: 480px) {
    .recovery-grid {
      grid-template-columns: 1fr;
    }
  }
</style>
