<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { auth } from '$lib/stores/auth.svelte.js';
  import Key from '$lib/components/icons/Key.svelte';
  import Plus from '$lib/components/icons/Plus.svelte';
  import Trash from '$lib/components/icons/Trash.svelte';
  import Copy from '$lib/components/icons/Copy.svelte';
  import Check from '$lib/components/icons/Check.svelte';

  interface Token {
    id: string;
    name: string;
    createdAt: string;
    lastUsedAt: string | null;
    expiresAt: string | null;
  }

  let tokens = $state<Token[]>([]);
  let loading = $state(true);
  let error = $state('');

  // Create form state
  let showForm = $state(false);
  let formName = $state('');
  let formExpiry = $state('');
  let formLoading = $state(false);
  let formError = $state('');

  // Newly created token display
  let newToken = $state<string | null>(null);
  let copied = $state(false);

  // Delete state
  let deletingId = $state<string | null>(null);

  function formatDate(iso: string | null): string {
    if (!iso) return 'Noch nie';
    return new Date(iso).toLocaleDateString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  }

  function formatDateFull(iso: string | null): string {
    if (!iso) return '–';
    return new Date(iso).toLocaleDateString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  }

  async function load() {
    loading = true;
    error = '';
    try {
      const res = await fetch('/api/v1/account/tokens');
      if (res.status === 401) {
        await goto('/login');
        return;
      }
      if (!res.ok) {
        error = 'Tokens konnten nicht geladen werden.';
        return;
      }
      tokens = (await res.json()) as Token[];
    } catch {
      error = 'Netzwerkfehler beim Laden.';
    } finally {
      loading = false;
    }
  }

  async function createToken() {
    if (!formName.trim()) {
      formError = 'Bitte einen Namen angeben.';
      return;
    }
    formLoading = true;
    formError = '';
    try {
      const body: Record<string, string> = { name: formName.trim() };
      if (formExpiry) body.expiresAt = new Date(formExpiry).toISOString();
      const res = await fetch('/api/v1/account/tokens', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as { message?: string };
        formError = json.message ?? 'Fehler beim Erstellen.';
        return;
      }
      const json = (await res.json()) as {
        token: string;
        id: string;
        name: string;
        createdAt: string;
        lastUsedAt: null;
        expiresAt: string | null;
      };
      newToken = json.token;
      tokens = [
        {
          id: json.id,
          name: json.name,
          createdAt: json.createdAt,
          lastUsedAt: null,
          expiresAt: json.expiresAt,
        },
        ...tokens,
      ];
      formName = '';
      formExpiry = '';
      showForm = false;
    } catch {
      formError = 'Netzwerkfehler.';
    } finally {
      formLoading = false;
    }
  }

  async function deleteToken(id: string) {
    if (deletingId) return;
    if (
      !confirm(
        'Diesen API-Token wirklich löschen? Alle Clients, die ihn nutzen, verlieren den Zugang.',
      )
    )
      return;
    deletingId = id;
    try {
      const res = await fetch(`/api/v1/account/tokens/${id}`, { method: 'DELETE' });
      if (res.ok) tokens = tokens.filter((t) => t.id !== id);
    } finally {
      deletingId = null;
    }
  }

  async function copyToken() {
    if (!newToken) return;
    try {
      await navigator.clipboard.writeText(newToken);
      copied = true;
      setTimeout(() => {
        copied = false;
      }, 2000);
    } catch {
      /* ignore */
    }
  }

  function dismissToken() {
    newToken = null;
    copied = false;
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
      <Key size={22} />
      <h1 class="page-title">API-Tokens</h1>
    </div>
    <button
      type="button"
      class="btn-primary"
      onclick={() => {
        showForm = !showForm;
        formError = '';
      }}
    >
      <Plus size={15} /> Neuer Token
    </button>
  </div>

  {#if loading}
    <div class="center"><span class="spinner" aria-hidden="true"></span></div>
  {:else}
    {#if error}
      <p class="msg-error">{error}</p>
    {/if}

    <!-- New token revealed -->
    {#if newToken}
      <div class="token-reveal panel">
        <div class="panel-body">
          <p class="reveal-warn">
            Dieser Token wird nur einmal angezeigt. Kopiere ihn jetzt und bewahre ihn sicher auf.
          </p>
          <div class="token-display">
            <code class="token-code">{newToken}</code>
            <button
              type="button"
              class="btn-copy"
              onclick={() => void copyToken()}
              title="Kopieren"
              aria-label="Token kopieren"
            >
              {#if copied}
                <Check size={15} />
              {:else}
                <Copy size={15} />
              {/if}
            </button>
          </div>
          {#if copied}
            <p class="copied-hint">Kopiert.</p>
          {/if}
          <button type="button" class="btn-dismiss" onclick={dismissToken}
            >Verstanden, Token gespeichert</button
          >
        </div>
      </div>
    {/if}

    <!-- Create form -->
    {#if showForm}
      <div class="panel form-panel">
        <div class="panel-head">
          <h2 class="panel-heading">Neuer API-Token</h2>
        </div>
        <div class="panel-body">
          <form
            onsubmit={(e) => {
              e.preventDefault();
              void createToken();
            }}
          >
            <div class="field">
              <label for="token-name" class="label">Name <span class="req">*</span></label>
              <input
                id="token-name"
                type="text"
                class="input"
                placeholder="z. B. CI-Pipeline"
                bind:value={formName}
                maxlength={64}
                required
              />
            </div>
            <div class="field">
              <label for="token-expiry" class="label"
                >Ablaufdatum <span class="opt">(optional)</span></label
              >
              <input
                id="token-expiry"
                type="date"
                class="input input-date"
                bind:value={formExpiry}
              />
            </div>
            {#if formError}
              <p class="msg-error">{formError}</p>
            {/if}
            <div class="form-actions">
              <button type="submit" class="btn-primary" disabled={formLoading}>
                {formLoading ? 'Erstelle…' : 'Token erstellen'}
              </button>
              <button
                type="button"
                class="btn-ghost"
                onclick={() => {
                  showForm = false;
                  formError = '';
                }}
              >
                Abbrechen
              </button>
            </div>
          </form>
        </div>
      </div>
    {/if}

    <!-- Token list -->
    <section class="panel">
      <div class="panel-head">
        <h2 class="panel-heading">Deine Tokens <span class="count-badge">{tokens.length}</span></h2>
      </div>
      {#if tokens.length === 0}
        <div class="panel-body empty-state">
          <Key size={32} />
          <p>Noch keine API-Tokens vorhanden.</p>
        </div>
      {:else}
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Erstellt</th>
                <th>Zuletzt genutzt</th>
                <th>Ablauf</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {#each tokens as token}
                <tr>
                  <td class="token-name">{token.name}</td>
                  <td class="muted">{formatDate(token.createdAt)}</td>
                  <td class="muted">{formatDate(token.lastUsedAt)}</td>
                  <td class="muted">{formatDateFull(token.expiresAt)}</td>
                  <td>
                    <button
                      type="button"
                      class="btn-row-action danger"
                      title="Token löschen"
                      aria-label="Token löschen"
                      onclick={() => void deleteToken(token.id)}
                      disabled={deletingId === token.id}
                    >
                      <Trash size={14} />
                    </button>
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      {/if}
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
  }

  /* Token reveal box */
  .token-reveal {
    margin-bottom: 20px;
    border-color: color-mix(in srgb, var(--brand) 40%, var(--border));
    background: color-mix(in srgb, var(--brand-soft, var(--brand)) 6%, var(--surface));
  }
  .reveal-warn {
    margin: 0 0 14px;
    font-size: 13px;
    color: var(--muted);
    line-height: 1.5;
  }
  .token-display {
    display: flex;
    align-items: center;
    gap: 10px;
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    padding: 10px 14px;
  }
  .token-code {
    flex: 1;
    font-family: var(--font-mono);
    font-size: 13px;
    word-break: break-all;
    color: var(--text);
  }
  .btn-copy {
    flex-shrink: 0;
    width: 30px;
    height: 30px;
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
  .copied-hint {
    margin: 8px 0 0;
    font-size: 12px;
    color: var(--brand);
  }
  .btn-dismiss {
    margin-top: 14px;
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    padding: 8px 16px;
    font-size: 13px;
    color: var(--text);
    cursor: pointer;
    transition: background var(--transition-fast);
  }
  .btn-dismiss:hover {
    background: var(--surface);
  }

  /* Panel */
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
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .panel-body {
    padding: 20px;
  }
  .count-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: var(--surface-2);
    color: var(--muted);
    border-radius: 9999px;
    font-size: 11px;
    padding: 1px 7px;
    font-weight: 600;
  }

  /* Form */
  .form-panel {
    margin-bottom: 20px;
  }
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
  .opt {
    color: var(--muted);
    font-weight: 400;
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
  .input-date {
    max-width: 200px;
  }
  .form-actions {
    display: flex;
    gap: 10px;
    align-items: center;
    flex-wrap: wrap;
    margin-top: 4px;
  }

  /* Empty state */
  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
    padding: 48px 20px;
    color: var(--muted);
    text-align: center;
  }
  .empty-state p {
    margin: 0;
    font-size: 14px;
  }

  /* Table */
  .table-wrap {
    overflow-x: auto;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;
  }
  th,
  td {
    text-align: left;
    padding: 13px 20px;
    border-bottom: 1px solid var(--border);
    white-space: nowrap;
  }
  thead th {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--dim);
    font-weight: 600;
  }
  tbody tr:last-child td {
    border-bottom: 0;
  }
  tbody tr:hover {
    background: var(--surface-2);
  }
  .token-name {
    font-weight: 600;
  }
  .muted {
    color: var(--muted);
  }

  /* Buttons */
  .btn-primary {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 8px 16px;
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
    padding: 8px 14px;
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

  .btn-row-action {
    width: 28px;
    height: 28px;
    border-radius: 6px;
    border: 1px solid var(--border);
    background: var(--surface);
    color: var(--muted);
    cursor: pointer;
    display: grid;
    place-items: center;
    transition:
      color var(--transition-fast),
      border-color var(--transition-fast);
  }
  .btn-row-action:hover:not(:disabled) {
    color: var(--text);
    border-color: var(--border-strong, var(--border));
  }
  .btn-row-action.danger:hover:not(:disabled) {
    color: var(--danger);
    border-color: color-mix(in srgb, var(--danger) 30%, var(--border));
  }
  .btn-row-action:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
</style>
