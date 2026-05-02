<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { auth } from '$lib/stores/auth.svelte.js';
  import Check from '$lib/components/icons/Check.svelte';

  interface RawSettings {
    registration_enabled: string;
    default_quota_bytes: string;
    max_upload_size_bytes: string;
    max_expiry_hours: string;
  }

  const GB = 1024 * 1024 * 1024;

  // Form state
  let registrationEnabled = $state(true);
  let defaultQuotaGb = $state(10);
  let maxUploadGb = $state(2);
  let maxExpiryHours = $state(168);

  let loading = $state(true);
  let saving = $state(false);
  let forbidden = $state(false);
  let successMsg = $state<string | null>(null);
  let errorMsg = $state<string | null>(null);

  function applySettings(raw: RawSettings) {
    registrationEnabled = raw.registration_enabled === 'true';
    defaultQuotaGb = Math.round(parseInt(raw.default_quota_bytes, 10) / GB) || 0;
    maxUploadGb = Math.round(parseInt(raw.max_upload_size_bytes, 10) / GB) || 0;
    maxExpiryHours = parseInt(raw.max_expiry_hours, 10) || 0;
  }

  async function load() {
    loading = true;
    try {
      const res = await fetch('/api/v1/admin/settings');
      if (res.status === 401) {
        await goto('/login');
        return;
      }
      if (res.status === 403) {
        forbidden = true;
        return;
      }
      if (res.ok) {
        const raw = (await res.json()) as RawSettings;
        applySettings(raw);
      }
    } finally {
      loading = false;
    }
  }

  async function save() {
    saving = true;
    successMsg = null;
    errorMsg = null;
    try {
      const payload = {
        registration_enabled: registrationEnabled,
        default_quota_bytes: defaultQuotaGb * GB,
        max_upload_size_bytes: maxUploadGb * GB,
        max_expiry_hours: maxExpiryHours,
      };
      const res = await fetch('/api/v1/admin/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { message?: string };
        errorMsg = err.message ?? `Fehler (HTTP ${res.status})`;
        return;
      }
      const updated = (await res.json()) as RawSettings;
      applySettings(updated);
      successMsg = 'Einstellungen gespeichert.';
      setTimeout(() => {
        successMsg = null;
      }, 3500);
    } finally {
      saving = false;
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

{#if loading}
  <div class="center"><span class="spinner" aria-hidden="true"></span></div>
{:else if forbidden}
  <div class="forbidden">
    <h1>403 — Forbidden</h1>
    <p>Dieses Konto hat keine Admin-Rolle.</p>
  </div>
{:else}
  <div class="crumbs"><a href="/admin">Admin</a> · Einstellungen</div>
  <div class="page-header">
    <div>
      <h1 class="page-title">Einstellungen</h1>
      <p class="page-sub">Systemweite Konfiguration</p>
    </div>
  </div>

  <section class="panel">
    <div class="panel-h">
      <h2>Allgemein</h2>
    </div>
    <div class="panel-body">
      <div class="form">
        <!-- Registration toggle -->
        <div class="field">
          <div class="field-label-group">
            <label for="reg-toggle" class="field-label">Registrierung erlaubt</label>
            <span class="field-hint">Neue Nutzer konnen sich registrieren, wenn aktiv.</span>
          </div>
          <button
            id="reg-toggle"
            role="switch"
            aria-checked={registrationEnabled}
            aria-label="Registrierung erlaubt"
            class="toggle"
            class:toggle-on={registrationEnabled}
            onclick={() => (registrationEnabled = !registrationEnabled)}
          >
            <span class="toggle-thumb"></span>
          </button>
        </div>

        <div class="divider"></div>

        <!-- Default quota -->
        <div class="field">
          <div class="field-label-group">
            <label for="default-quota" class="field-label">Standard-Quota (GB)</label>
            <span class="field-hint">Quota fur neu registrierte Nutzer.</span>
          </div>
          <div class="input-wrap">
            <input id="default-quota" type="number" min="0" step="1" bind:value={defaultQuotaGb} />
            <span class="input-unit">GB</span>
          </div>
        </div>

        <div class="divider"></div>

        <!-- Max upload size -->
        <div class="field">
          <div class="field-label-group">
            <label for="max-upload" class="field-label">Max. Upload-Grosse (GB)</label>
            <span class="field-hint">Maximale Grosse einer einzelnen Upload-Session.</span>
          </div>
          <div class="input-wrap">
            <input id="max-upload" type="number" min="0" step="1" bind:value={maxUploadGb} />
            <span class="input-unit">GB</span>
          </div>
        </div>

        <div class="divider"></div>

        <!-- Max expiry hours -->
        <div class="field">
          <div class="field-label-group">
            <label for="max-expiry" class="field-label">Max. Ablaufzeit (Stunden)</label>
            <span class="field-hint">Maximale Gultigkeitsdauer eines Share-Links.</span>
          </div>
          <div class="input-wrap">
            <input id="max-expiry" type="number" min="1" step="1" bind:value={maxExpiryHours} />
            <span class="input-unit">h</span>
          </div>
        </div>

        <div class="divider"></div>

        <!-- Actions -->
        <div class="actions">
          <button class="btn-primary" onclick={save} disabled={saving}>
            {#if saving}
              <span class="spinner-sm" aria-hidden="true"></span> Speichern ...
            {:else}
              <Check size={14} /> Speichern
            {/if}
          </button>

          {#if successMsg}
            <div class="feedback success" role="status">{successMsg}</div>
          {/if}
          {#if errorMsg}
            <div class="feedback error" role="alert">{errorMsg}</div>
          {/if}
        </div>
      </div>
    </div>
  </section>
{/if}

<style>
  .center {
    display: flex;
    justify-content: center;
    padding: 80px;
  }
  .spinner {
    width: 28px;
    height: 28px;
    border: 2.5px solid var(--border);
    border-top-color: var(--brand);
    border-radius: 50%;
    animation: spin 0.7s linear infinite;
  }
  .spinner-sm {
    display: inline-block;
    width: 14px;
    height: 14px;
    border: 2px solid var(--border);
    border-top-color: var(--brand);
    border-radius: 50%;
    animation: spin 0.7s linear infinite;
    vertical-align: middle;
  }
  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  .forbidden {
    text-align: center;
    padding: 80px 24px;
  }
  .forbidden h1 {
    color: var(--danger);
    margin: 0 0 8px;
  }
  .forbidden p {
    color: var(--muted);
  }

  .crumbs {
    color: var(--muted);
    font-size: 13px;
    margin-bottom: 12px;
  }
  .crumbs a {
    color: var(--brand);
  }

  .page-header {
    margin-bottom: 20px;
  }
  .page-title {
    margin: 0 0 4px;
    font-size: 28px;
    letter-spacing: -0.02em;
  }
  .page-sub {
    margin: 0;
    color: var(--muted);
    font-size: 14px;
  }

  .panel {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    box-shadow: var(--shadow-card);
    margin-bottom: 22px;
    max-width: 640px;
  }
  .panel-h {
    display: flex;
    align-items: center;
    padding: 18px 22px;
    border-bottom: 1px solid var(--border);
  }
  .panel-h h2 {
    margin: 0;
    font-size: 13px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--muted);
    font-weight: 600;
  }
  .panel-body {
    padding: 4px 0;
  }

  .form {
    display: flex;
    flex-direction: column;
  }
  .divider {
    height: 1px;
    background: var(--border);
    margin: 0;
  }

  .field {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 18px 22px;
    gap: 24px;
  }
  .field-label-group {
    display: flex;
    flex-direction: column;
    gap: 3px;
    min-width: 0;
  }
  .field-label {
    font-size: 14px;
    font-weight: 500;
    color: var(--text);
  }
  .field-hint {
    font-size: 12px;
    color: var(--muted);
  }

  /* Toggle switch */
  .toggle {
    position: relative;
    width: 44px;
    height: 24px;
    border-radius: 99px;
    background: var(--border);
    border: none;
    cursor: pointer;
    flex-shrink: 0;
    transition: background var(--transition-fast);
    padding: 0;
  }
  .toggle.toggle-on {
    background: var(--brand);
  }
  .toggle-thumb {
    position: absolute;
    top: 3px;
    left: 3px;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: var(--surface);
    transition: transform var(--transition-fast);
    pointer-events: none;
  }
  .toggle-on .toggle-thumb {
    transform: translateX(20px);
  }

  /* Number inputs */
  .input-wrap {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-shrink: 0;
  }
  .input-wrap input[type='number'] {
    width: 90px;
    height: 36px;
    padding: 0 10px;
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    color: var(--text);
    font-family: var(--font-mono);
    font-size: 14px;
    text-align: right;
    transition: border-color var(--transition-fast);
  }
  .input-wrap input[type='number']:focus {
    outline: none;
    border-color: var(--brand);
  }
  .input-unit {
    font-size: 12px;
    color: var(--muted);
    font-family: var(--font-mono);
    min-width: 18px;
  }

  .actions {
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 18px 22px;
    flex-wrap: wrap;
  }

  .btn-primary {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 8px 18px;
    background: var(--brand);
    color: var(--surface);
    border: none;
    border-radius: var(--radius-sm);
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    transition: opacity var(--transition-fast);
  }
  .btn-primary:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
  .btn-primary:not(:disabled):hover {
    opacity: 0.88;
  }

  .feedback {
    font-size: 13px;
    padding: 6px 12px;
    border-radius: var(--radius-sm);
  }
  .feedback.success {
    background: var(--brand-soft);
    color: var(--brand-strong);
  }
  .feedback.error {
    background: var(--surface);
    color: var(--danger);
    border: 1px solid var(--danger);
  }
</style>
