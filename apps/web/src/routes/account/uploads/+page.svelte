<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { _ } from 'svelte-i18n';
  import { auth } from '$lib/stores/auth.svelte.js';
  import Trash from '$lib/components/icons/Trash.svelte';
  import RefreshCw from '$lib/components/icons/RefreshCw.svelte';
  import Lock from '$lib/components/icons/Lock.svelte';
  import Files from '$lib/components/icons/Files.svelte';

  interface Upload {
    id: string;
    wordcode: string;
    createdAt: string;
    expiresAt: string;
    expired: boolean;
    downloadLimit: number;
    downloadsUsed: number;
    totalSizeBytes: number;
    passwordProtected: boolean;
  }

  interface Quota {
    totalBytes: number;
    usedBytes: number;
    remainingBytes: number;
  }

  interface PageData {
    uploads: Upload[];
    quota: Quota;
  }

  let data = $state<PageData | null>(null);
  let loading = $state(true);
  let error = $state('');
  let deletingId = $state<string | null>(null);

  function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
    return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
  }

  function formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  }

  function pct(used: number, total: number): number {
    if (total === 0) return 0;
    return Math.min(100, (used / total) * 100);
  }

  async function load() {
    loading = true;
    error = '';
    try {
      const res = await fetch('/api/v1/account/uploads');
      if (res.status === 401) {
        await goto('/login');
        return;
      }
      if (!res.ok) {
        error = $_('account.uploads.error_load');
        return;
      }
      data = (await res.json()) as PageData;
    } catch {
      error = $_('account.uploads.error_network');
    } finally {
      loading = false;
    }
  }

  async function deleteUpload(id: string) {
    if (deletingId) return;
    if (!confirm($_('account.uploads.confirm_delete'))) return;
    deletingId = id;
    try {
      const res = await fetch(`/api/v1/account/uploads/${id}`, { method: 'DELETE' });
      if (res.ok && data) {
        data = { ...data, uploads: data.uploads.filter((u) => u.id !== id) };
      }
    } finally {
      deletingId = null;
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

  const quotaPct = $derived(data ? pct(data.quota.usedBytes, data.quota.totalBytes) : 0);
</script>

<div class="page">
  <div class="page-header">
    <div class="page-title-row">
      <Files size={22} />
      <h1 class="page-title">{$_('account.uploads.title')}</h1>
    </div>
    <button
      type="button"
      class="btn-icon"
      title={$_('account.uploads.refresh')}
      aria-label={$_('account.uploads.refresh')}
      onclick={() => void load()}
      disabled={loading}
    >
      <RefreshCw size={16} />
    </button>
  </div>

  {#if loading}
    <div class="center"><span class="spinner" aria-hidden="true"></span></div>
  {:else if error}
    <p class="msg-error">{error}</p>
  {:else if data}
    <!-- Quota -->
    <section class="panel quota-panel">
      <div class="panel-body">
        <div class="quota-head">
          <span class="quota-label">{$_('account.uploads.quota_label')}</span>
          <span class="quota-value">
            <b>{formatBytes(data.quota.usedBytes)}</b> von {formatBytes(data.quota.totalBytes)} &middot;
            {formatBytes(data.quota.remainingBytes)} frei
          </span>
        </div>
        <div
          class="quota-bar"
          role="progressbar"
          aria-valuenow={quotaPct}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div class="quota-fill" style="width: {quotaPct}%"></div>
        </div>
      </div>
    </section>

    <!-- Uploads list -->
    <section class="panel">
      <div class="panel-head">
        <h2 class="panel-heading">
          {$_('account.uploads.uploads_heading')}
          <span class="count-badge">{data.uploads.length}</span>
        </h2>
      </div>
      {#if data.uploads.length === 0}
        <div class="panel-body empty-state">
          <Files size={32} />
          <p>{$_('account.uploads.no_uploads')}</p>
          <a href="/" class="link">{$_('account.uploads.send_file')}</a>
        </div>
      {:else}
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>{$_('account.uploads.col_wordcode')}</th>
                <th>{$_('account.uploads.col_created')}</th>
                <th>{$_('account.uploads.col_expiry')}</th>
                <th>{$_('account.uploads.col_downloads')}</th>
                <th>{$_('account.uploads.col_size')}</th>
                <th>{$_('account.uploads.col_protection')}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {#each data.uploads as upload}
                <tr class:expired={upload.expired}>
                  <td>
                    <span class="wordcode">{upload.wordcode || upload.id.slice(0, 16)}</span>
                  </td>
                  <td class="muted">{formatDate(upload.createdAt)}</td>
                  <td class:danger-text={upload.expired}>
                    {upload.expired
                      ? $_('account.uploads.expired_label')
                      : formatDate(upload.expiresAt)}
                  </td>
                  <td>
                    {upload.downloadsUsed} / {upload.downloadLimit === 0
                      ? '&#x221e;'
                      : upload.downloadLimit}
                  </td>
                  <td class="muted">{formatBytes(upload.totalSizeBytes)}</td>
                  <td>
                    {#if upload.passwordProtected}
                      <span
                        class="lock-icon"
                        title={$_('account.uploads.password_protected')}
                        aria-label={$_('account.uploads.password_protected')}
                      >
                        <Lock size={14} />
                      </span>
                    {/if}
                  </td>
                  <td>
                    <button
                      type="button"
                      class="btn-row-action danger"
                      title={$_('account.uploads.delete_btn')}
                      aria-label={$_('account.uploads.delete_aria')}
                      onclick={() => void deleteUpload(upload.id)}
                      disabled={deletingId === upload.id}
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
    gap: 0;
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
    padding: 14px 18px;
    font-size: 14px;
    margin: 0;
  }

  /* Quota */
  .quota-panel {
    margin-bottom: 20px;
  }
  .quota-head {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    flex-wrap: wrap;
    gap: 8px;
    margin-bottom: 12px;
  }
  .quota-label {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.07em;
    color: var(--muted);
    font-weight: 600;
  }
  .quota-value {
    font-size: 13px;
    color: var(--muted);
  }
  .quota-value b {
    color: var(--text);
  }
  .quota-bar {
    height: 8px;
    background: var(--surface-2);
    border-radius: 9999px;
    overflow: hidden;
  }
  .quota-fill {
    height: 100%;
    background: var(--brand);
    border-radius: 9999px;
    transition: width 0.4s;
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
  .link {
    color: var(--brand);
    font-size: 14px;
    text-decoration: none;
  }
  .link:hover {
    text-decoration: underline;
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
  tbody tr.expired {
    opacity: 0.55;
  }
  .wordcode {
    font-family: var(--font-mono);
    font-size: 13px;
    font-weight: 600;
    color: var(--text);
  }
  .muted {
    color: var(--muted);
  }
  .danger-text {
    color: var(--danger);
  }
  .lock-icon {
    color: var(--muted);
    display: inline-flex;
    align-items: center;
  }

  /* Buttons */
  .btn-icon {
    width: 32px;
    height: 32px;
    border-radius: var(--radius-sm);
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
  .btn-icon:hover:not(:disabled) {
    color: var(--text);
    border-color: var(--border-strong, var(--border));
  }
  .btn-icon:disabled {
    opacity: 0.5;
    cursor: not-allowed;
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
