<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { auth } from '$lib/stores/auth.svelte.js';
  import Trash from '$lib/components/icons/Trash.svelte';
  import Shield from '$lib/components/icons/Shield.svelte';

  interface AdminShare {
    id: string;
    wordcode: string;
    createdAt: string;
    expiresAt: string | null;
    expired: boolean;
    downloadLimit: number | null;
    downloadsUsed: number;
    totalSizeBytes: number;
    userId: string | null;
    userEmail: string | null;
    passwordProtected: boolean;
  }

  interface SharesResponse {
    total: number;
    shares: AdminShare[];
  }

  let total = $state(0);
  let shares = $state<AdminShare[]>([]);
  let loading = $state(true);
  let loadingMore = $state(false);
  let forbidden = $state(false);
  let offset = $state(0);
  const limit = 50;

  let deletingId = $state<string | null>(null);
  let deleteError = $state<string | null>(null);

  function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
    return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
  }

  function formatDate(iso: string | null): string {
    if (!iso) return '-';
    return new Date(iso).toLocaleDateString('de-DE');
  }

  function expiryLabel(share: AdminShare): string {
    if (!share.expiresAt) return 'kein Ablauf';
    if (share.expired) return `abgelaufen ${formatDate(share.expiresAt)}`;
    return formatDate(share.expiresAt);
  }

  function downloadsLabel(share: AdminShare): string {
    const used = share.downloadsUsed;
    const lim = share.downloadLimit;
    if (lim == null) return `${used}`;
    return `${used} / ${lim}`;
  }

  async function load(reset = false) {
    if (reset) {
      offset = 0;
      shares = [];
      loading = true;
    } else {
      loadingMore = true;
    }
    try {
      const res = await fetch(`/api/v1/admin/shares?limit=${limit}&offset=${offset}`);
      if (res.status === 401) {
        await goto('/login');
        return;
      }
      if (res.status === 403) {
        forbidden = true;
        return;
      }
      if (res.ok) {
        const body = (await res.json()) as SharesResponse;
        total = body.total;
        shares = reset ? body.shares : [...shares, ...body.shares];
        offset = shares.length;
      }
    } finally {
      loading = false;
      loadingMore = false;
    }
  }

  async function confirmDelete(id: string) {
    deleteError = null;
    const res = await fetch(`/api/v1/admin/shares/${id}`, { method: 'DELETE' });
    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { message?: string };
      deleteError = err.message ?? 'Fehler beim Loschen';
      return;
    }
    shares = shares.filter((s) => s.id !== id);
    total = Math.max(0, total - 1);
    deletingId = null;
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
          void load(true);
        }
      }, 50);
    } else {
      if (!auth.user) {
        void goto('/login');
        return;
      }
      void load(true);
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
  <div class="crumbs"><a href="/admin">Admin</a> · Shares</div>
  <div class="page-header">
    <div>
      <h1 class="page-title">Shares</h1>
      <p class="page-sub">{total} Shares insgesamt</p>
    </div>
  </div>

  <section class="panel">
    <div class="panel-h">
      <h2>Alle Shares</h2>
      <span class="hint-pill">{shares.length} geladen</span>
    </div>
    <div class="table-body">
      {#if shares.length === 0}
        <p class="empty">Keine Shares vorhanden.</p>
      {:else}
        <table>
          <thead>
            <tr>
              <th>Code</th>
              <th>Ersteller</th>
              <th>Erstellt</th>
              <th>Lauft ab</th>
              <th>Downloads</th>
              <th>Grosse</th>
              <th></th>
              <th>Aktionen</th>
            </tr>
          </thead>
          <tbody>
            {#each shares as share (share.id)}
              <tr class:expired-row={share.expired}>
                <td>
                  <span class="wordcode" title={share.id}>{share.wordcode}</span>
                </td>
                <td class="muted">
                  {share.userEmail ?? 'anonym'}
                </td>
                <td class="muted">{formatDate(share.createdAt)}</td>
                <td>
                  <span class:expired-text={share.expired} class:muted={!share.expired}>
                    {expiryLabel(share)}
                  </span>
                </td>
                <td class="mono">{downloadsLabel(share)}</td>
                <td class="mono">{formatBytes(share.totalSizeBytes)}</td>
                <td>
                  {#if share.passwordProtected}
                    <span class="pw-icon" title="Passwortgeschutzt">
                      <Shield size={14} />
                    </span>
                  {/if}
                </td>
                <td>
                  <button
                    class="btn-danger-ghost"
                    onclick={() => {
                      deletingId = share.id;
                      deleteError = null;
                    }}
                    title="Share loschen"
                  >
                    <Trash size={14} />
                  </button>
                </td>
              </tr>

              <!-- Delete confirm row -->
              {#if deletingId === share.id}
                <tr class="confirm-row">
                  <td colspan="8">
                    <div class="confirm-bar">
                      <span
                        >Share <strong class="mono">{share.wordcode}</strong> wirklich loschen?</span
                      >
                      <div class="confirm-actions">
                        <button class="btn-ghost" onclick={() => (deletingId = null)}
                          >Abbrechen</button
                        >
                        <button class="btn-danger" onclick={() => confirmDelete(share.id)}>
                          <Trash size={14} /> Loschen
                        </button>
                      </div>
                      {#if deleteError}
                        <span class="inline-error">{deleteError}</span>
                      {/if}
                    </div>
                  </td>
                </tr>
              {/if}
            {/each}
          </tbody>
        </table>
      {/if}
    </div>

    {#if shares.length < total}
      <div class="load-more">
        <button class="btn-ghost" onclick={() => load(false)} disabled={loadingMore}>
          {#if loadingMore}Laden ...{:else}Mehr laden ({total - shares.length} weitere){/if}
        </button>
      </div>
    {/if}
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
  }
  .panel-h {
    display: flex;
    justify-content: space-between;
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
  .hint-pill {
    color: var(--dim);
    font-size: 12px;
  }

  .table-body {
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
    padding: 13px 22px;
    border-bottom: 1px solid var(--border);
  }
  thead th {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--dim);
    font-weight: 600;
    white-space: nowrap;
  }
  tbody tr:hover {
    background: var(--surface-2);
  }
  tbody tr:last-child td {
    border-bottom: 0;
  }

  .expired-row {
    opacity: 0.7;
  }
  .expired-text {
    color: var(--danger);
    font-size: 13px;
    white-space: nowrap;
  }

  .wordcode {
    font-family: var(--font-mono);
    font-size: 13px;
    font-weight: 600;
    color: var(--text);
    letter-spacing: 0.02em;
  }

  .pw-icon {
    color: var(--muted);
    display: inline-flex;
    align-items: center;
  }
  .mono {
    font-family: var(--font-mono);
    font-size: 13px;
  }
  .muted {
    color: var(--muted);
    font-size: 13px;
    white-space: nowrap;
  }
  .empty {
    color: var(--muted);
    font-size: 14px;
    margin: 22px;
  }

  .confirm-row td {
    background: var(--surface-2);
    padding: 13px 22px;
    border-bottom: 1px solid var(--border);
  }
  .confirm-bar {
    display: flex;
    align-items: center;
    gap: 16px;
    flex-wrap: wrap;
    font-size: 14px;
  }
  .confirm-actions {
    display: flex;
    gap: 8px;
    margin-left: auto;
  }
  .inline-error {
    color: var(--danger);
    font-size: 13px;
  }

  .btn-ghost {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 5px 12px;
    background: transparent;
    color: var(--brand);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    font-size: 13px;
    cursor: pointer;
    transition: background var(--transition-fast);
  }
  .btn-ghost:hover {
    background: var(--surface-2);
  }
  .btn-ghost:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .btn-danger-ghost {
    display: inline-flex;
    align-items: center;
    padding: 5px 8px;
    background: transparent;
    color: var(--dim);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    cursor: pointer;
    transition:
      color var(--transition-fast),
      border-color var(--transition-fast);
  }
  .btn-danger-ghost:hover {
    color: var(--danger);
    border-color: var(--danger);
  }

  .btn-danger {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 6px 14px;
    background: var(--danger);
    color: var(--surface);
    border: none;
    border-radius: var(--radius-sm);
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    transition: opacity var(--transition-fast);
  }
  .btn-danger:hover {
    opacity: 0.85;
  }

  .load-more {
    padding: 16px 22px;
    border-top: 1px solid var(--border);
    display: flex;
    justify-content: center;
  }
</style>
