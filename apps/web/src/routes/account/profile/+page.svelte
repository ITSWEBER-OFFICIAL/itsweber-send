<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { _ } from 'svelte-i18n';
  import { auth } from '$lib/stores/auth.svelte.js';
  import User from '$lib/components/icons/User.svelte';
  import Check from '$lib/components/icons/Check.svelte';

  interface Profile {
    id: string;
    email: string;
    displayName: string | null;
    role: string;
    createdAt: string;
  }

  let profile = $state<Profile | null>(null);
  let loading = $state(true);
  let error = $state('');

  // Form state
  let formEmail = $state('');
  let formDisplayName = $state('');
  let formLoading = $state(false);
  let formError = $state('');
  let formSuccess = $state('');

  function formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  }

  function roleLabel(role: string): string {
    switch (role) {
      case 'admin':
        return $_('account.profile.role_admin');
      case 'user':
        return $_('account.profile.role_user');
      default:
        return role;
    }
  }

  async function load() {
    loading = true;
    error = '';
    try {
      const res = await fetch('/api/v1/account/profile');
      if (res.status === 401) {
        await goto('/login');
        return;
      }
      if (!res.ok) {
        error = $_('account.profile.error_load');
        return;
      }
      profile = (await res.json()) as Profile;
      formEmail = profile.email;
      formDisplayName = profile.displayName ?? '';
    } catch {
      error = $_('account.profile.error_network');
    } finally {
      loading = false;
    }
  }

  async function saveProfile() {
    if (!profile || formLoading) return;
    if (!formEmail.trim()) {
      formError = $_('account.profile.error_email_required');
      return;
    }
    formLoading = true;
    formError = '';
    formSuccess = '';
    try {
      const res = await fetch('/api/v1/account/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: formEmail.trim(),
          displayName: formDisplayName.trim() || null,
        }),
      });
      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as { message?: string };
        formError = json.message ?? $_('account.profile.error_save');
        return;
      }
      profile = (await res.json()) as Profile;
      formEmail = profile.email;
      formDisplayName = profile.displayName ?? '';
      formSuccess = $_('account.profile.success');
      setTimeout(() => {
        formSuccess = '';
      }, 3000);
    } catch {
      formError = $_('account.profile.error_network_save');
    } finally {
      formLoading = false;
    }
  }

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
      <User size={22} />
      <h1 class="page-title">{$_('account.profile.title')}</h1>
    </div>
  </div>

  {#if loading}
    <div class="center"><span class="spinner" aria-hidden="true"></span></div>
  {:else if error}
    <p class="msg-error">{error}</p>
  {:else if profile}
    <!-- Account info -->
    <section class="panel info-panel">
      <div class="panel-head">
        <h2 class="panel-heading">{$_('account.profile.section_info')}</h2>
      </div>
      <div class="panel-body info-grid">
        <div class="info-row">
          <span class="info-key">{$_('account.profile.field_id')}</span>
          <span class="info-val mono">{profile.id}</span>
        </div>
        <div class="info-row">
          <span class="info-key">{$_('account.profile.field_role')}</span>
          <span class="info-val">
            <span class="role-badge" class:admin={profile.role === 'admin'}
              >{roleLabel(profile.role)}</span
            >
          </span>
        </div>
        <div class="info-row">
          <span class="info-key">{$_('account.profile.field_member_since')}</span>
          <span class="info-val">{formatDate(profile.createdAt)}</span>
        </div>
      </div>
    </section>

    <!-- Edit form -->
    <section class="panel">
      <div class="panel-head">
        <h2 class="panel-heading">{$_('account.profile.section_edit')}</h2>
      </div>
      <div class="panel-body">
        <form
          onsubmit={(e) => {
            e.preventDefault();
            void saveProfile();
          }}
        >
          <div class="field">
            <label for="display-name" class="label"
              >{$_('account.profile.field_display_name')} <span class="opt">(optional)</span></label
            >
            <input
              id="display-name"
              type="text"
              class="input"
              placeholder={$_('account.profile.field_display_name_placeholder')}
              bind:value={formDisplayName}
              maxlength={80}
            />
            <span class="hint">{$_('account.profile.field_display_name_hint')}</span>
          </div>
          <div class="field">
            <label for="email" class="label"
              >{$_('account.profile.field_email')} <span class="req">*</span></label
            >
            <input
              id="email"
              type="email"
              class="input"
              bind:value={formEmail}
              required
              autocomplete="email"
            />
          </div>

          {#if formError}
            <p class="msg-error">{formError}</p>
          {/if}
          {#if formSuccess}
            <p class="msg-success">
              <Check size={14} />
              {formSuccess}
            </p>
          {/if}

          <div class="form-actions">
            <button type="submit" class="btn-primary" disabled={formLoading}>
              {formLoading ? $_('account.profile.saving') : $_('account.profile.save')}
            </button>
            <button
              type="button"
              class="btn-ghost"
              onclick={() => {
                formEmail = profile!.email;
                formDisplayName = profile!.displayName ?? '';
                formError = '';
                formSuccess = '';
              }}
            >
              {$_('account.profile.reset')}
            </button>
          </div>
        </form>
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
    justify-content: space-between;
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

  /* Info panel */
  .info-grid {
    display: flex;
    flex-direction: column;
    gap: 0;
    padding: 0;
  }
  .info-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px 20px;
    gap: 16px;
    border-bottom: 1px solid var(--border);
  }
  .info-row:last-child {
    border-bottom: 0;
  }
  .info-key {
    font-size: 13px;
    color: var(--muted);
    flex-shrink: 0;
  }
  .info-val {
    font-size: 13px;
    color: var(--text);
    text-align: right;
  }
  .mono {
    font-family: var(--font-mono);
    font-size: 12px;
    word-break: break-all;
  }
  .role-badge {
    display: inline-flex;
    align-items: center;
    padding: 2px 10px;
    border-radius: 9999px;
    font-size: 12px;
    font-weight: 600;
    background: var(--surface-2);
    color: var(--muted);
    border: 1px solid var(--border);
  }
  .role-badge.admin {
    background: color-mix(in srgb, var(--brand) 12%, var(--surface));
    color: var(--brand-strong, var(--brand));
    border-color: color-mix(in srgb, var(--brand) 30%, var(--border));
  }

  /* Form */
  .field {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-bottom: 18px;
  }
  .label {
    font-size: 13px;
    font-weight: 600;
    color: var(--text);
  }
  .req {
    color: var(--danger);
  }
  .opt {
    color: var(--muted);
    font-weight: 400;
  }
  .hint {
    font-size: 12px;
    color: var(--muted);
  }
  .input {
    width: 100%;
    max-width: 440px;
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
  .form-actions {
    display: flex;
    gap: 10px;
    align-items: center;
    flex-wrap: wrap;
    margin-top: 4px;
  }
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
</style>
