<script lang="ts">
  import { _ } from 'svelte-i18n';
  import { goto } from '$app/navigation';
  import { auth } from '$lib/stores/auth.svelte.js';

  let email = $state('');
  let password = $state('');
  let totpCode = $state('');
  let recoveryCode = $state('');
  let loading = $state(false);
  let error = $state('');
  let requires2FA = $state(false);
  let useRecovery = $state(false);

  function canSubmit2FA(): boolean {
    if (useRecovery) return recoveryCode.trim().length >= 8;
    return totpCode.length === 6;
  }

  async function submit() {
    if (!email || !password) return;
    if (requires2FA && !canSubmit2FA()) return;
    loading = true;
    error = '';
    try {
      const body: Record<string, string> = { email, password };
      if (requires2FA) {
        if (useRecovery) {
          body.recoveryCode = recoveryCode.trim();
        } else {
          body.totpCode = totpCode;
        }
      }

      const res = await fetch('/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (res.status === 202) {
        requires2FA = true;
        totpCode = '';
        recoveryCode = '';
        return;
      }

      if (res.ok) {
        await auth.load();
        await goto('/account');
      } else {
        const resp = (await res.json()) as { error?: string };
        if (res.status === 401 && requires2FA) {
          error = $_('auth.error_invalid_2fa');
          totpCode = '';
          recoveryCode = '';
        } else {
          error =
            res.status === 401
              ? $_('auth.error_invalid')
              : (resp.error ?? $_('auth.error_generic'));
        }
      }
    } catch {
      error = $_('auth.error_generic');
    } finally {
      loading = false;
    }
  }
</script>

<main class="page">
  <div class="card-wrap">
    <div class="card">
      {#if !requires2FA}
        <h1 class="title">{$_('auth.login_title')}</h1>
        <form
          onsubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <div class="field">
            <label class="label" for="email">{$_('auth.email')}</label>
            <input
              id="email"
              type="email"
              class="input"
              placeholder={$_('auth.email_placeholder')}
              bind:value={email}
              autocomplete="email"
              required
            />
          </div>
          <div class="field">
            <label class="label" for="password">{$_('auth.password')}</label>
            <input
              id="password"
              type="password"
              class="input"
              placeholder={$_('auth.password_placeholder')}
              bind:value={password}
              autocomplete="current-password"
              required
            />
          </div>
          {#if error}
            <p class="error">{error}</p>
          {/if}
          <button class="btn-primary" type="submit" disabled={loading || !email || !password}>
            {#if loading}
              <span class="spinner" aria-hidden="true"></span>
            {/if}
            {$_('auth.login_button')}
          </button>
        </form>
      {:else}
        <h1 class="title">
          {useRecovery ? $_('auth.2fa_recovery_title') : $_('auth.2fa_title')}
        </h1>
        <p class="totp-hint">
          {useRecovery ? $_('auth.2fa_recovery_hint') : $_('auth.2fa_hint')}
        </p>
        <form
          onsubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          {#if useRecovery}
            <div class="field">
              <label class="label" for="recovery-code">{$_('auth.2fa_recovery_label')}</label>
              <input
                id="recovery-code"
                type="text"
                class="input totp-input"
                placeholder={$_('auth.2fa_recovery_placeholder')}
                bind:value={recoveryCode}
                autocomplete="off"
                spellcheck="false"
              />
            </div>
          {:else}
            <div class="field">
              <label class="label" for="totp">{$_('auth.2fa_code_label')}</label>
              <input
                id="totp"
                type="text"
                inputmode="numeric"
                pattern="[0-9]{6}"
                maxlength="6"
                class="input totp-input"
                placeholder="123456"
                bind:value={totpCode}
                autocomplete="one-time-code"
              />
            </div>
          {/if}
          {#if error}
            <p class="error">{error}</p>
          {/if}
          <button class="btn-primary" type="submit" disabled={loading || !canSubmit2FA()}>
            {#if loading}
              <span class="spinner" aria-hidden="true"></span>
            {/if}
            {$_('auth.2fa_confirm')}
          </button>
          <button
            class="btn-toggle"
            type="button"
            onclick={() => {
              useRecovery = !useRecovery;
              totpCode = '';
              recoveryCode = '';
              error = '';
            }}
          >
            {useRecovery ? $_('auth.2fa_use_totp') : $_('auth.2fa_use_recovery')}
          </button>
          <button
            class="btn-secondary"
            type="button"
            onclick={() => {
              requires2FA = false;
              useRecovery = false;
              totpCode = '';
              recoveryCode = '';
              error = '';
            }}
          >
            {$_('auth.2fa_back')}
          </button>
        </form>
      {/if}
      <p class="switch-link">
        {$_('auth.login_no_account')}
        <a href="/register">{$_('auth.login_register_link')}</a>
      </p>
    </div>
  </div>
</main>

<style>
  .page {
    max-width: 420px;
    margin: 0 auto;
    padding: 80px 24px;
  }
  .card-wrap {
    width: 100%;
  }
  .card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 16px;
    padding: 32px 28px;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.06);
  }
  .title {
    margin: 0 0 24px;
    font-size: 22px;
    font-weight: 700;
    letter-spacing: -0.02em;
  }
  .totp-hint {
    color: var(--muted);
    font-size: 14px;
    margin: -16px 0 20px;
    line-height: 1.5;
  }
  .field {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-bottom: 16px;
  }
  .label {
    font-size: 13px;
    color: var(--muted);
    font-weight: 500;
  }
  .input {
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: 8px;
    color: var(--text);
    font-size: 15px;
    padding: 10px 12px;
    box-sizing: border-box;
    width: 100%;
  }
  .input:focus {
    outline: 2px solid var(--brand);
    outline-offset: 2px;
  }
  .totp-input {
    font-family: var(--font-mono);
    font-size: 24px;
    letter-spacing: 0.15em;
    text-align: center;
  }
  .error {
    color: var(--danger);
    font-size: 13px;
    margin: 0 0 12px;
  }
  .btn-primary {
    width: 100%;
    padding: 12px;
    background: var(--brand);
    color: #0a1a26;
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
    margin-top: 4px;
  }
  .btn-primary:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .btn-primary:not(:disabled):hover {
    opacity: 0.88;
  }
  .btn-secondary {
    width: 100%;
    padding: 10px;
    background: transparent;
    color: var(--muted);
    border: 1px solid var(--border);
    border-radius: 10px;
    font-size: 14px;
    cursor: pointer;
    margin-top: 8px;
    transition:
      color 0.15s,
      border-color 0.15s;
  }
  .btn-secondary:hover {
    color: var(--text);
    border-color: var(--text);
  }
  .btn-toggle {
    width: 100%;
    padding: 8px;
    background: transparent;
    color: var(--brand);
    border: none;
    font-size: 13px;
    cursor: pointer;
    margin-top: 6px;
    text-decoration: underline;
    text-underline-offset: 2px;
  }
  .btn-toggle:hover {
    opacity: 0.8;
  }
  .spinner {
    width: 14px;
    height: 14px;
    border: 2px solid rgba(255, 255, 255, 0.4);
    border-top-color: #0a1a26;
    border-radius: 50%;
    animation: spin 0.7s linear infinite;
  }
  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
  .switch-link {
    text-align: center;
    font-size: 14px;
    color: var(--muted);
    margin: 20px 0 0;
  }
  .switch-link a {
    color: var(--brand);
    text-decoration: none;
  }
  .switch-link a:hover {
    text-decoration: underline;
  }

  @media (max-width: 480px) {
    .page {
      padding: 40px 16px;
    }
    .card {
      padding: 20px 16px;
    }
  }
</style>
