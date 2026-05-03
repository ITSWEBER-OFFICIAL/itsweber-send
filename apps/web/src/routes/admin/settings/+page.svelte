<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { auth } from '$lib/stores/auth.svelte.js';
  import { _ } from 'svelte-i18n';
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

  // SMTP form state. The pass field is treated specially: when the
  // server reports `__set__` we leave the input empty in the UI (so a
  // save without typing leaves the stored secret untouched). The user
  // has to actively type a new value to overwrite, or send an empty
  // string to clear.
  interface SmtpResponse {
    env: { host: string; port: string; secure: string; user: string; from: string };
    settings: {
      smtp_host: string;
      smtp_port: string;
      smtp_secure: string;
      smtp_user: string;
      smtp_pass: string;
      smtp_from: string;
    };
  }
  let smtpHost = $state('');
  let smtpPort = $state('');
  let smtpSecure = $state(false);
  let smtpUser = $state('');
  let smtpPass = $state('');
  let smtpPassConfigured = $state(false);
  let smtpFrom = $state('');
  let smtpEnv = $state<SmtpResponse['env']>({ host: '', port: '', secure: '', user: '', from: '' });
  let smtpSaving = $state(false);
  let smtpSuccessMsg = $state<string | null>(null);
  let smtpErrorMsg = $state<string | null>(null);
  let smtpTestRecipient = $state('');
  let smtpTesting = $state(false);
  let smtpTestMsg = $state<string | null>(null);
  let smtpTestErr = $state<string | null>(null);

  function applySmtp(raw: SmtpResponse) {
    smtpEnv = raw.env;
    smtpHost = raw.settings.smtp_host;
    smtpPort = raw.settings.smtp_port;
    smtpSecure = raw.settings.smtp_secure === 'true';
    smtpUser = raw.settings.smtp_user;
    smtpPass = '';
    smtpPassConfigured = raw.settings.smtp_pass === '__set__';
    smtpFrom = raw.settings.smtp_from;
  }

  function applySettings(raw: RawSettings) {
    registrationEnabled = raw.registration_enabled === 'true';
    defaultQuotaGb = Math.round(parseInt(raw.default_quota_bytes, 10) / GB) || 0;
    maxUploadGb = Math.round(parseInt(raw.max_upload_size_bytes, 10) / GB) || 0;
    maxExpiryHours = parseInt(raw.max_expiry_hours, 10) || 0;
  }

  async function load() {
    loading = true;
    try {
      const [genRes, smtpRes] = await Promise.all([
        fetch('/api/v1/admin/settings'),
        fetch('/api/v1/admin/settings/smtp'),
      ]);
      if (genRes.status === 401) {
        await goto('/login');
        return;
      }
      if (genRes.status === 403) {
        forbidden = true;
        return;
      }
      if (genRes.ok) {
        const raw = (await genRes.json()) as RawSettings;
        applySettings(raw);
      }
      if (smtpRes.ok) {
        applySmtp((await smtpRes.json()) as SmtpResponse);
      }
    } finally {
      loading = false;
    }
  }

  async function saveSmtp() {
    smtpSaving = true;
    smtpSuccessMsg = null;
    smtpErrorMsg = null;
    try {
      // Only include `smtp_pass` in the payload when the user actually
      // typed something. An untouched, empty input means "leave the
      // stored secret alone"; the explicit `__clear` checkbox below is
      // the way to wipe a stored secret.
      const payload: Record<string, string> = {
        smtp_host: smtpHost.trim(),
        smtp_port: smtpPort.trim(),
        smtp_secure: smtpSecure ? 'true' : 'false',
        smtp_user: smtpUser.trim(),
        smtp_from: smtpFrom.trim(),
      };
      if (smtpPass.length > 0) {
        payload.smtp_pass = smtpPass;
      }
      const res = await fetch('/api/v1/admin/settings/smtp', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        smtpErrorMsg = err.error ?? 'Save failed';
        return;
      }
      const updated = (await res.json()) as { settings: SmtpResponse['settings'] };
      // Refresh just the settings half from the response.
      applySmtp({ env: smtpEnv, settings: updated.settings });
      smtpSuccessMsg = 'SMTP-Einstellungen gespeichert.';
      setTimeout(() => {
        smtpSuccessMsg = null;
      }, 3500);
    } finally {
      smtpSaving = false;
    }
  }

  async function clearSmtpPass() {
    smtpSaving = true;
    smtpSuccessMsg = null;
    smtpErrorMsg = null;
    try {
      const res = await fetch('/api/v1/admin/settings/smtp', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ smtp_pass: '' }),
      });
      if (!res.ok) {
        smtpErrorMsg = 'Konnte Passwort nicht löschen.';
        return;
      }
      const updated = (await res.json()) as { settings: SmtpResponse['settings'] };
      applySmtp({ env: smtpEnv, settings: updated.settings });
      smtpSuccessMsg = 'SMTP-Passwort gelöscht.';
      setTimeout(() => {
        smtpSuccessMsg = null;
      }, 3500);
    } finally {
      smtpSaving = false;
    }
  }

  async function sendTestMail() {
    smtpTesting = true;
    smtpTestMsg = null;
    smtpTestErr = null;
    try {
      const res = await fetch('/api/v1/admin/settings/smtp/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: smtpTestRecipient.trim() }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        smtpTestErr = err.error ?? `Test fehlgeschlagen (${res.status})`;
        return;
      }
      smtpTestMsg = `Test-E-Mail an ${smtpTestRecipient.trim()} versendet.`;
      setTimeout(() => {
        smtpTestMsg = null;
      }, 5000);
    } finally {
      smtpTesting = false;
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
        errorMsg =
          err.message ?? $_('admin.settings.error_save', { values: { status: res.status } });
        return;
      }
      const updated = (await res.json()) as RawSettings;
      applySettings(updated);
      successMsg = $_('admin.settings.saved');
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
    <p>{$_('admin.access_denied')}</p>
  </div>
{:else}
  <div class="crumbs"><a href="/admin">Admin</a> · {$_('admin.settings.breadcrumb')}</div>
  <div class="page-header">
    <div>
      <h1 class="page-title">{$_('admin.settings.title')}</h1>
      <p class="page-sub">{$_('admin.settings.sub')}</p>
    </div>
  </div>

  <section class="panel">
    <div class="panel-h">
      <h2>{$_('admin.settings.panel_general')}</h2>
    </div>
    <div class="panel-body">
      <div class="form">
        <!-- Registration toggle -->
        <div class="field">
          <div class="field-label-group">
            <label for="reg-toggle" class="field-label"
              >{$_('admin.settings.field_registration')}</label
            >
            <span class="field-hint">{$_('admin.settings.field_registration_hint')}</span>
          </div>
          <button
            id="reg-toggle"
            role="switch"
            aria-checked={registrationEnabled}
            aria-label={$_('admin.settings.field_registration')}
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
            <label for="default-quota" class="field-label"
              >{$_('admin.settings.field_default_quota')}</label
            >
            <span class="field-hint">{$_('admin.settings.field_default_quota_hint')}</span>
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
            <label for="max-upload" class="field-label"
              >{$_('admin.settings.field_max_upload')}</label
            >
            <span class="field-hint">{$_('admin.settings.field_max_upload_hint')}</span>
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
            <label for="max-expiry" class="field-label"
              >{$_('admin.settings.field_max_expiry')}</label
            >
            <span class="field-hint">{$_('admin.settings.field_max_expiry_hint')}</span>
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
              <span class="spinner-sm" aria-hidden="true"></span> {$_('admin.settings.saving')}
            {:else}
              <Check size={14} /> {$_('common.save')}
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

  <section class="panel">
    <div class="panel-h">
      <h2>SMTP / Benachrichtigungen</h2>
    </div>
    <div class="panel-body">
      <p class="panel-intro">
        Konfiguriert den Mailversand für die "Beim Download benachrichtigen"-Option. Solange kein
        Host gesetzt ist (weder hier noch über die Umgebungsvariable <code>SMTP_HOST</code>), ist
        die Benachrichtigung still deaktiviert — Uploads funktionieren trotzdem, der Toggle im
        Frontend bleibt aber wirkungslos.
      </p>

      <div class="form">
        <div class="field">
          <div class="field-label-group">
            <label class="field-label" for="smtp-host">SMTP-Host</label>
            <span class="field-hint">
              z. B. <code>smtp.gmail.com</code>, <code>smtp.fastmail.com</code>.
              {#if !smtpHost && smtpEnv.host}Aktuell aus <code>SMTP_HOST</code>: {smtpEnv.host}{/if}
            </span>
          </div>
          <div class="input-wrap">
            <input
              id="smtp-host"
              type="text"
              autocomplete="off"
              spellcheck="false"
              placeholder="smtp.example.com"
              bind:value={smtpHost}
            />
          </div>
        </div>

        <div class="divider"></div>

        <div class="field">
          <div class="field-label-group">
            <label class="field-label" for="smtp-port">Port</label>
            <span class="field-hint">587 (STARTTLS) oder 465 (TLS)</span>
          </div>
          <div class="input-wrap">
            <input
              id="smtp-port"
              type="text"
              inputmode="numeric"
              pattern="[0-9]*"
              placeholder="587"
              bind:value={smtpPort}
            />
          </div>
        </div>

        <div class="divider"></div>

        <div class="field">
          <div class="field-label-group">
            <label class="field-label" for="smtp-secure">Implicit TLS (Port 465)</label>
            <span class="field-hint"
              >Aktivieren, wenn der Server auf 465 erwartet — sonst aus für STARTTLS auf 587.</span
            >
          </div>
          <button
            id="smtp-secure"
            type="button"
            role="switch"
            aria-checked={smtpSecure}
            aria-label="Implicit TLS (Port 465)"
            class="toggle"
            class:toggle-on={smtpSecure}
            onclick={() => (smtpSecure = !smtpSecure)}
          >
            <span class="toggle-thumb"></span>
          </button>
        </div>

        <div class="divider"></div>

        <div class="field">
          <div class="field-label-group">
            <label class="field-label" for="smtp-user">Benutzername</label>
            <span class="field-hint">Leer lassen, wenn der Relay keine Auth erwartet.</span>
          </div>
          <div class="input-wrap">
            <input
              id="smtp-user"
              type="text"
              autocomplete="off"
              spellcheck="false"
              placeholder="user@example.com"
              bind:value={smtpUser}
            />
          </div>
        </div>

        <div class="divider"></div>

        <div class="field">
          <div class="field-label-group">
            <label class="field-label" for="smtp-pass">Passwort / App-Token</label>
            <span class="field-hint">
              {#if smtpPassConfigured}
                Aktuell gespeichert. Feld leer lassen = unverändert. Mit "Löschen" entfernen.
              {:else}
                Wird verschlüsselt-at-rest in der SQLite-DB gespeichert.
              {/if}
            </span>
          </div>
          <div class="input-wrap">
            <input
              id="smtp-pass"
              type="password"
              autocomplete="new-password"
              placeholder={smtpPassConfigured ? '••••••••' : ''}
              bind:value={smtpPass}
            />
            {#if smtpPassConfigured}
              <button type="button" class="input-aux" onclick={() => void clearSmtpPass()}
                >Löschen</button
              >
            {/if}
          </div>
        </div>

        <div class="divider"></div>

        <div class="field">
          <div class="field-label-group">
            <label class="field-label" for="smtp-from">From-Adresse</label>
            <span class="field-hint"
              >Leer lassen → SMTP-Benutzer wird als Absender verwendet. Format z. B.
              <code>ITSWEBER Send &lt;noreply@example.com&gt;</code>.</span
            >
          </div>
          <div class="input-wrap">
            <input
              id="smtp-from"
              type="text"
              autocomplete="off"
              spellcheck="false"
              placeholder="noreply@example.com"
              bind:value={smtpFrom}
            />
          </div>
        </div>

        <div class="divider"></div>

        <div class="actions">
          <button class="btn-primary" onclick={() => void saveSmtp()} disabled={smtpSaving}>
            {#if smtpSaving}
              <span class="spinner-sm" aria-hidden="true"></span> Speichert …
            {:else}
              <Check size={14} /> Speichern
            {/if}
          </button>
          {#if smtpSuccessMsg}
            <div class="feedback success" role="status">{smtpSuccessMsg}</div>
          {/if}
          {#if smtpErrorMsg}
            <div class="feedback error" role="alert">{smtpErrorMsg}</div>
          {/if}
        </div>

        <div class="divider"></div>

        <div class="field">
          <div class="field-label-group">
            <label class="field-label" for="smtp-test">Test-E-Mail senden</label>
            <span class="field-hint"
              >Verifiziert die Verbindung gegen den konfigurierten Relay und schickt eine
              Test-Nachricht. Speichere zuerst, falls du gerade Werte geändert hast.</span
            >
          </div>
          <div class="input-wrap">
            <input
              id="smtp-test"
              type="email"
              autocomplete="off"
              placeholder="empfaenger@example.com"
              bind:value={smtpTestRecipient}
            />
            <button
              type="button"
              class="input-aux"
              onclick={() => void sendTestMail()}
              disabled={smtpTesting || !smtpTestRecipient.trim()}
            >
              {smtpTesting ? 'Sende …' : 'Senden'}
            </button>
          </div>
        </div>
        {#if smtpTestMsg}
          <div class="feedback success" role="status">{smtpTestMsg}</div>
        {/if}
        {#if smtpTestErr}
          <div class="feedback error" role="alert">{smtpTestErr}</div>
        {/if}
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
    min-width: 240px;
  }
  /* Long-form text fields (host, user, from-address) take the full row
     width so the user can read what they typed; the row itself wraps
     under its label on narrow viewports. */
  .field:has(.input-wrap input[type='text']),
  .field:has(.input-wrap input[type='email']),
  .field:has(.input-wrap input[type='password']) {
    flex-direction: column;
    align-items: stretch;
    gap: 8px;
  }
  .field:has(.input-wrap input[type='text']) .input-wrap,
  .field:has(.input-wrap input[type='email']) .input-wrap,
  .field:has(.input-wrap input[type='password']) .input-wrap {
    flex-shrink: 1;
    min-width: 0;
    width: 100%;
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
  .input-wrap input[type='number']:focus,
  .input-wrap input[type='text']:focus,
  .input-wrap input[type='email']:focus,
  .input-wrap input[type='password']:focus {
    outline: none;
    border-color: var(--brand);
  }
  .input-wrap input[type='text'],
  .input-wrap input[type='email'],
  .input-wrap input[type='password'] {
    flex: 1;
    min-width: 0;
    height: 36px;
    padding: 0 10px;
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    color: var(--text);
    font-family: var(--font-mono);
    font-size: 14px;
    transition: border-color var(--transition-fast);
  }
  .input-aux {
    height: 36px;
    padding: 0 14px;
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    color: var(--text);
    font-family: inherit;
    font-size: 13px;
    cursor: pointer;
    transition:
      border-color var(--transition-fast),
      color var(--transition-fast);
  }
  .input-aux:hover:not(:disabled) {
    border-color: var(--brand);
    color: var(--brand);
  }
  .input-aux:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }
  .panel-intro {
    margin: 0 22px 16px;
    color: var(--muted);
    font-size: 13px;
    line-height: 1.55;
  }
  .panel-intro code {
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 1px 6px;
    font-size: 12px;
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
