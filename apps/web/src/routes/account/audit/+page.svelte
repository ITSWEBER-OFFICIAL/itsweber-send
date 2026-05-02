<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { auth } from '$lib/stores/auth.svelte.js';
  import FileText from '$lib/components/icons/FileText.svelte';
  import RefreshCw from '$lib/components/icons/RefreshCw.svelte';

  interface AuditEntry {
    id: string;
    user_id: string;
    action: string;
    resource: string | null;
    ip: string | null;
    created_at: string;
  }

  interface AuditResponse {
    total: number;
    entries: AuditEntry[];
  }

  const PAGE_SIZE = 50;

  const ACTION_LABELS: Record<string, string> = {
    'user.login': 'Anmeldung',
    'user.logout': 'Abmeldung',
    'user.register': 'Registrierung',
    'share.created': 'Share erstellt',
    'share.deleted': 'Share gelöscht',
    'token.created': 'API-Token erstellt',
    'token.deleted': 'API-Token gelöscht',
    'profile.updated': 'Profil aktualisiert',
    'password.changed': 'Passwort geändert',
    '2fa.enabled': '2FA aktiviert',
    '2fa.disabled': '2FA deaktiviert',
  };

  let entries = $state<AuditEntry[]>([]);
  let total = $state(0);
  let offset = $state(0);
  let loading = $state(true);
  let loadingMore = $state(false);
  let error = $state<string | null>(null);

  function actionLabel(action: string): string {
    return ACTION_LABELS[action] ?? action;
  }

  function formatDate(iso: string): string {
    return new Date(iso).toLocaleString('de-DE');
  }

  async function load(append = false) {
    if (append) {
      loadingMore = true;
    } else {
      loading = true;
    }
    error = null;

    try {
      const currentOffset = append ? offset : 0;
      const res = await fetch(`/api/v1/account/audit?limit=${PAGE_SIZE}&offset=${currentOffset}`);
      if (res.status === 401) {
        await goto('/login');
        return;
      }
      if (!res.ok) {
        error = `Fehler beim Laden (${res.status})`;
        return;
      }
      const json = (await res.json()) as AuditResponse;
      total = json.total;

      if (append) {
        entries = [...entries, ...json.entries];
        offset = currentOffset + json.entries.length;
      } else {
        entries = json.entries;
        offset = json.entries.length;
      }
    } catch {
      error = 'Verbindungsfehler. Bitte Seite neu laden.';
    } finally {
      loading = false;
      loadingMore = false;
    }
  }

  async function loadMore() {
    await load(true);
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
          void load(false);
        }
      }, 50);
    } else {
      if (!auth.user) {
        void goto('/login');
        return;
      }
      void load(false);
    }
  });

  const hasMore = $derived(entries.length < total);
</script>

<div class="page">
  <header class="page-header">
    <FileText size={20} />
    <div>
      <h1>Audit-Log</h1>
      <p class="sub">Protokoll aller sicherheitsrelevanten Aktionen auf deinem Konto.</p>
    </div>
    <button
      type="button"
      class="reload-btn"
      onclick={() => void load(false)}
      disabled={loading || loadingMore}
      aria-label="Neu laden"
      title="Neu laden"
    >
      <RefreshCw size={15} />
    </button>
  </header>

  {#if loading}
    <div class="center"><span class="spinner" aria-hidden="true"></span></div>
  {:else if error}
    <div class="error-box">{error}</div>
  {:else}
    <section class="panel">
      <div class="panel-head">
        <h2>Ereignisse</h2>
        {#if total > 0}
          <span class="count-badge">{total}</span>
        {/if}
      </div>

      {#if entries.length === 0}
        <div class="panel-body">
          <p class="empty">Keine Einträge vorhanden.</p>
        </div>
      {:else}
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Zeitstempel</th>
                <th>Aktion</th>
                <th>Ressource</th>
                <th>IP</th>
              </tr>
            </thead>
            <tbody>
              {#each entries as entry (entry.id)}
                <tr>
                  <td class="ts">{formatDate(entry.created_at)}</td>
                  <td>
                    <span class="action-label" data-action={entry.action}>
                      {actionLabel(entry.action)}
                    </span>
                  </td>
                  <td class="resource">
                    {#if entry.resource}
                      <code class="mono">{entry.resource}</code>
                    {:else}
                      <span class="dim">—</span>
                    {/if}
                  </td>
                  <td class="ip">
                    {#if entry.ip}
                      <code class="mono">{entry.ip}</code>
                    {:else}
                      <span class="dim">—</span>
                    {/if}
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>

        {#if hasMore}
          <div class="load-more-row">
            <button
              type="button"
              class="load-more-btn"
              onclick={() => void loadMore()}
              disabled={loadingMore}
            >
              {#if loadingMore}
                <span class="spinner-sm" aria-hidden="true"></span>
                Wird geladen&hellip;
              {:else}
                Altere laden ({total - entries.length} weitere)
              {/if}
            </button>
          </div>
        {:else if total > PAGE_SIZE}
          <div class="load-more-row">
            <span class="all-loaded">Alle {total} Einträge geladen.</span>
          </div>
        {/if}
      {/if}
    </section>
  {/if}
</div>

<style>
  .page {
    max-width: 940px;
  }

  .page-header {
    display: flex;
    align-items: flex-start;
    gap: 14px;
    margin-bottom: 32px;
    color: var(--brand);
  }
  .page-header > div {
    flex: 1;
  }
  .page-header h1 {
    margin: 0 0 4px;
    font-size: 22px;
    letter-spacing: -0.02em;
    color: var(--text);
  }
  .page-header .sub {
    margin: 0;
    font-size: 14px;
    color: var(--muted);
    line-height: 1.5;
  }
  .reload-btn {
    flex-shrink: 0;
    margin-top: 2px;
    width: 32px;
    height: 32px;
    border-radius: var(--radius-sm);
    border: 1px solid var(--border);
    background: var(--surface);
    color: var(--muted);
    cursor: pointer;
    display: grid;
    place-items: center;
    transition: color var(--transition-fast);
  }
  .reload-btn:hover:not(:disabled) {
    color: var(--text);
  }
  .reload-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

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
    width: 13px;
    height: 13px;
    border: 2px solid var(--border);
    border-top-color: var(--brand);
    border-radius: 50%;
    animation: spin 0.7s linear infinite;
    vertical-align: -2px;
  }
  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  .error-box {
    padding: 16px 20px;
    border: 1px solid var(--danger);
    border-radius: var(--radius);
    color: var(--danger);
    font-size: 14px;
    background: color-mix(in srgb, var(--danger) 8%, var(--surface));
  }

  .panel {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
  }
  .panel-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 16px 20px;
    border-bottom: 1px solid var(--border);
  }
  .panel-head h2 {
    margin: 0;
    font-size: 13px;
    text-transform: uppercase;
    letter-spacing: 0.07em;
    color: var(--muted);
    font-weight: 600;
  }
  .panel-body {
    padding: 20px;
  }
  .count-badge {
    font-size: 12px;
    font-weight: 600;
    padding: 2px 8px;
    border-radius: 9999px;
    background: var(--surface-2);
    color: var(--muted);
    border: 1px solid var(--border);
  }

  .table-wrap {
    overflow-x: auto;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 14px;
  }
  th,
  td {
    text-align: left;
    padding: 12px 20px;
    border-bottom: 1px solid var(--border);
  }
  thead th {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--dim);
    font-weight: 600;
  }
  tbody tr:hover {
    background: var(--surface-2);
  }
  tbody tr:last-child td {
    border-bottom: 0;
  }

  .ts {
    font-family: var(--font-mono);
    font-size: 12px;
    color: var(--muted);
    white-space: nowrap;
  }
  .action-label {
    font-size: 13px;
    font-weight: 500;
  }
  /* Subtle color hints per action category */
  .action-label[data-action^='user.login'],
  .action-label[data-action^='user.register'] {
    color: var(--brand-strong);
  }
  .action-label[data-action^='share.deleted'],
  .action-label[data-action^='token.deleted'],
  .action-label[data-action^='2fa.disabled'] {
    color: var(--danger);
  }
  .resource {
    max-width: 220px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .ip {
    white-space: nowrap;
  }
  .mono {
    font-family: var(--font-mono);
    font-size: 12px;
    color: var(--text);
  }
  .dim {
    color: var(--dim);
  }
  .empty {
    margin: 0;
    color: var(--muted);
    font-size: 14px;
  }

  .load-more-row {
    display: flex;
    justify-content: center;
    padding: 16px 20px;
    border-top: 1px solid var(--border);
  }
  .load-more-btn {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 9px 20px;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--surface-2);
    color: var(--text);
    font-family: inherit;
    font-size: 14px;
    cursor: pointer;
    transition:
      background var(--transition-fast),
      border-color var(--transition-fast);
  }
  .load-more-btn:hover:not(:disabled) {
    background: var(--surface);
    border-color: var(--brand);
    color: var(--brand);
  }
  .load-more-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
  .all-loaded {
    font-size: 13px;
    color: var(--dim);
  }
</style>
