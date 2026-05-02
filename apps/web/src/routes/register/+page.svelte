<script lang="ts">
  import { _ } from 'svelte-i18n';
  import { goto } from '$app/navigation';
  import { auth } from '$lib/stores/auth.svelte.js';

  let email = $state('');
  let password = $state('');
  let loading = $state(false);
  let error = $state('');

  async function submit() {
    if (!email || !password) return;
    loading = true;
    error = '';
    try {
      const res = await fetch('/api/v1/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      if (res.ok) {
        await auth.load();
        await goto('/account');
      } else {
        const body = (await res.json()) as { error?: string };
        if (res.status === 409) {
          error = $_('auth.error_email_taken');
        } else {
          error = body.error ?? $_('auth.error_generic');
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
      <h1 class="title">{$_('auth.register_title')}</h1>
      <form onsubmit={(e) => { e.preventDefault(); void submit(); }}>
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
            autocomplete="new-password"
            minlength="8"
            required
          />
        </div>
        {#if error}
          <p class="error">{error}</p>
        {/if}
        <button class="btn-primary" type="submit" disabled={loading || !email || password.length < 8}>
          {#if loading}
            <span class="spinner" aria-hidden="true"></span>
          {/if}
          {$_('auth.register_button')}
        </button>
      </form>
      <p class="switch-link">
        {$_('auth.register_has_account')}
        <a href="/login">{$_('auth.register_login_link')}</a>
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
  .card-wrap { width: 100%; }
  .card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 16px;
    padding: 32px 28px;
    box-shadow: 0 4px 20px rgba(0,0,0,0.06);
  }
  .title { margin: 0 0 24px; font-size: 22px; font-weight: 700; letter-spacing: -0.02em; }
  .field { display: flex; flex-direction: column; gap: 6px; margin-bottom: 16px; }
  .label { font-size: 13px; color: var(--muted); font-weight: 500; }
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
  .input:focus { outline: 2px solid var(--brand); outline-offset: 2px; }
  .error { color: #d9534f; font-size: 13px; margin: 0 0 12px; }
  .btn-primary {
    width: 100%;
    padding: 12px;
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
    margin-top: 4px;
  }
  .btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
  .btn-primary:not(:disabled):hover { opacity: 0.88; }
  .spinner {
    width: 14px;
    height: 14px;
    border: 2px solid rgba(255,255,255,0.4);
    border-top-color: #fff;
    border-radius: 50%;
    animation: spin 0.7s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }
  .switch-link { text-align: center; font-size: 14px; color: var(--muted); margin: 20px 0 0; }
  .switch-link a { color: var(--brand); text-decoration: none; }
  .switch-link a:hover { text-decoration: underline; }

  @media (max-width: 480px) {
    .page { padding: 40px 16px; }
    .card { padding: 20px 16px; }
  }
</style>
