<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { auth } from '$lib/stores/auth.svelte.js';
  import Bell from '$lib/components/icons/Bell.svelte';
  import Check from '$lib/components/icons/Check.svelte';

  interface NotificationSettings {
    emailOnDownload: boolean;
    emailOnExpiry: boolean;
  }

  let settings = $state<NotificationSettings | null>(null);
  let loading = $state(true);
  let error = $state('');
  let saving = $state(false);
  let saved = $state(false);

  async function load() {
    loading = true;
    error = '';
    try {
      const res = await fetch('/api/v1/account/notifications');
      if (res.status === 401) {
        await goto('/login');
        return;
      }
      if (!res.ok) {
        error = 'Einstellungen konnten nicht geladen werden.';
        return;
      }
      settings = (await res.json()) as NotificationSettings;
    } catch {
      error = 'Netzwerkfehler beim Laden.';
    } finally {
      loading = false;
    }
  }

  async function save() {
    if (!settings || saving) return;
    saving = true;
    saved = false;
    error = '';
    try {
      const res = await fetch('/api/v1/account/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });
      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as { message?: string };
        error = json.message ?? 'Fehler beim Speichern.';
        return;
      }
      saved = true;
      setTimeout(() => {
        saved = false;
      }, 2500);
    } catch {
      error = 'Netzwerkfehler.';
    } finally {
      saving = false;
    }
  }

  async function toggle(key: keyof NotificationSettings) {
    if (!settings) return;
    settings = { ...settings, [key]: !settings[key] };
    await save();
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
      <Bell size={22} />
      <h1 class="page-title">Benachrichtigungen</h1>
    </div>
    {#if saved}
      <span class="saved-hint">
        <Check size={14} /> Gespeichert
      </span>
    {/if}
  </div>

  {#if loading}
    <div class="center"><span class="spinner" aria-hidden="true"></span></div>
  {:else if error}
    <p class="msg-error">{error}</p>
  {:else if settings}
    <section class="panel">
      <div class="panel-head">
        <h2 class="panel-heading">E-Mail-Benachrichtigungen</h2>
      </div>

      <!-- Toggle: email on download -->
      <div class="toggle-row">
        <div class="toggle-info">
          <span class="toggle-label">E-Mail bei Download</span>
          <span class="toggle-desc">Wenn jemand einen deiner Shares herunterlädt</span>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={settings.emailOnDownload}
          class="toggle"
          class:on={settings.emailOnDownload}
          onclick={() => void toggle('emailOnDownload')}
          disabled={saving}
          aria-label="E-Mail bei Download"
        >
          <span class="thumb" aria-hidden="true"></span>
        </button>
      </div>

      <div class="row-divider"></div>

      <!-- Toggle: email on expiry -->
      <div class="toggle-row">
        <div class="toggle-info">
          <span class="toggle-label">E-Mail bei Ablauf</span>
          <span class="toggle-desc">Kurz bevor ein Share abläuft</span>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={settings.emailOnExpiry}
          class="toggle"
          class:on={settings.emailOnExpiry}
          onclick={() => void toggle('emailOnExpiry')}
          disabled={saving}
          aria-label="E-Mail bei Ablauf"
        >
          <span class="thumb" aria-hidden="true"></span>
        </button>
      </div>
    </section>

    <div class="info-note">
      <Bell size={14} />
      <span>E-Mail-Benachrichtigungen werden versendet, wenn ein SMTP-Server konfiguriert ist.</span
      >
    </div>
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
    gap: 12px;
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
  .saved-hint {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font-size: 13px;
    color: var(--brand);
    font-weight: 500;
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
    margin: 0;
  }

  .panel {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    box-shadow: var(--shadow-card);
    margin-bottom: 20px;
    overflow: hidden;
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

  /* Toggle rows */
  .toggle-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 20px;
    gap: 24px;
  }
  .toggle-info {
    display: flex;
    flex-direction: column;
    gap: 3px;
  }
  .toggle-label {
    font-size: 14px;
    font-weight: 600;
    color: var(--text);
  }
  .toggle-desc {
    font-size: 13px;
    color: var(--muted);
  }
  .row-divider {
    height: 1px;
    background: var(--border);
    margin: 0;
  }

  /* Toggle switch */
  .toggle {
    flex-shrink: 0;
    position: relative;
    width: 42px;
    height: 24px;
    border-radius: 12px;
    border: none;
    background: var(--surface-2);
    cursor: pointer;
    transition: background var(--transition-fast);
    outline: none;
  }
  .toggle:focus-visible {
    box-shadow: 0 0 0 2px var(--brand);
  }
  .toggle.on {
    background: var(--brand);
  }
  .toggle:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .thumb {
    position: absolute;
    top: 3px;
    left: 3px;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: var(--surface);
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.18);
    transition: transform var(--transition-fast);
    pointer-events: none;
  }
  .toggle.on .thumb {
    transform: translateX(18px);
  }

  /* Info note */
  .info-note {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    padding: 12px 16px;
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    font-size: 13px;
    color: var(--muted);
    line-height: 1.5;
  }
  .info-note :global(svg) {
    flex-shrink: 0;
    margin-top: 1px;
  }
</style>
