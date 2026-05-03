<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { _ } from 'svelte-i18n';
  import { auth } from '$lib/stores/auth.svelte.js';
  import type { AccountUpload } from '@itsweber-send/shared';
  import Copy from '$lib/components/icons/Copy.svelte';
  import Trash from '$lib/components/icons/Trash.svelte';
  import RefreshCw from '$lib/components/icons/RefreshCw.svelte';
  import Plus from '$lib/components/icons/Plus.svelte';
  import ChevronRight from '$lib/components/icons/ChevronRight.svelte';

  interface AccountData {
    uploads: AccountUpload[];
    quota: { totalBytes: number; usedBytes: number; remainingBytes: number };
  }

  let data = $state<AccountData | null>(null);
  let loading = $state(true);
  let deletingId = $state<string | null>(null);
  let copyId = $state<string | null>(null);

  function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
    return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
  }

  function relativeExpiry(iso: string, expired: boolean): string {
    if (expired) return '—';
    const d = new Date(iso).getTime();
    const diff = d - Date.now();
    if (diff < 0) return '—';
    const hours = Math.floor(diff / (1000 * 60 * 60));
    if (hours < 1) return `${Math.floor(diff / (1000 * 60))} min`;
    if (hours < 24) return `in ${hours} h`;
    const days = Math.floor(hours / 24);
    return `in ${days} d`;
  }

  function fileTypeBadge(name: string): { label: string; tone: string } {
    const ext = (name.split('.').pop() || '').toLowerCase();
    if (ext === 'pdf') return { label: 'PDF', tone: 'pdf' };
    if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(ext))
      return { label: ext.toUpperCase(), tone: 'img' };
    if (['zip', 'tar', 'gz', '7z'].includes(ext)) return { label: ext.toUpperCase(), tone: 'zip' };
    if (['md', 'txt', 'log'].includes(ext)) return { label: ext.toUpperCase(), tone: 'txt' };
    return { label: 'FILE', tone: 'def' };
  }

  async function load() {
    loading = true;
    try {
      const res = await fetch('/api/v1/account/uploads');
      if (res.status === 401) {
        await goto('/login');
        return;
      }
      if (res.ok) data = (await res.json()) as AccountData;
    } finally {
      loading = false;
    }
  }

  async function deleteUpload(id: string) {
    if (deletingId) return;
    if (!confirm($_('account.overview.confirm_delete'))) return;
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

  async function copyId_(id: string) {
    try {
      await navigator.clipboard.writeText(id);
      copyId = id;
      setTimeout(() => {
        if (copyId === id) copyId = null;
      }, 1200);
    } catch {
      /* ignore */
    }
  }

  function pct(used: number, total: number): number {
    if (total === 0) return 0;
    return Math.min(100, (used / total) * 100);
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

  const stats = $derived.by(() => {
    if (!data) return null;
    const active = data.uploads.filter((u) => !u.expired).length;
    const totalDownloads = data.uploads.reduce((s, u) => s + u.downloadsUsed, 0);
    return { active, totalDownloads };
  });

  const recentUploads = $derived(
    (data?.uploads ?? []).slice(0, 5).map((u) => {
      const firstFile = u.id; // Backend exposes only id; filename inside encrypted manifest, not here.
      return { ...u, filename: u.id.slice(0, 12), firstFile };
    }),
  );
</script>

{#if loading}
  <div class="center"><span class="spinner" aria-hidden="true"></span></div>
{:else if data}
  <div class="crumbs"><a href="/account">Account</a> · {$_('account.overview.breadcrumb')}</div>
  <h1 class="hello">
    {$_('account.overview.greeting', { values: { name: auth.user?.email.split('@')[0] } })}
  </h1>
  <p class="sub">
    {#if auth.user?.role === 'admin'}{$_('account.overview.admin_badge')} ·
    {/if}
    {auth.user?.email}
  </p>

  <!-- Stat Cards -->
  <div class="stats">
    <div class="stat-card">
      <div class="label">{$_('account.overview.stat_active_uploads')}</div>
      <div class="value">{stats?.active ?? 0}</div>
      <div class="delta">
        {$_('account.overview.stat_total', { values: { count: data.uploads.length } })}
      </div>
    </div>
    <div class="stat-card">
      <div class="label">{$_('account.overview.stat_storage_used')}</div>
      <div class="value">{formatBytes(data.quota.usedBytes)}</div>
      <div class="delta">
        {$_('account.overview.stat_storage_of', {
          values: { total: formatBytes(data.quota.totalBytes) },
        })}
      </div>
    </div>
    <div class="stat-card">
      <div class="label">{$_('account.overview.stat_downloads')}</div>
      <div class="value">{stats?.totalDownloads ?? 0}</div>
      <div class="delta">{$_('account.overview.stat_downloads_delta')}</div>
    </div>
    <div class="stat-card">
      <div class="label">{$_('account.overview.stat_tokens')}</div>
      <div class="value">0</div>
      <div class="delta dim">{$_('account.overview.stat_tokens_soon')}</div>
    </div>
  </div>

  <!-- Quota -->
  <section class="quota panel">
    <div class="panel-body quota-body">
      <div class="quota-head">
        <h2>{$_('account.overview.quota_heading')}</h2>
        <div class="v">
          <b>{formatBytes(data.quota.usedBytes)}</b>
          von {formatBytes(data.quota.totalBytes)} ·
          {$_('account.overview.quota_free', {
            values: { size: formatBytes(data.quota.remainingBytes) },
          })}
        </div>
      </div>
      <div class="quota-bar">
        <div
          class="seg used"
          style="width: {pct(data.quota.usedBytes, data.quota.totalBytes)}%"
        ></div>
      </div>
      <div class="quota-legend">
        <span
          ><span class="dot used"></span>{$_('account.overview.quota_used_label')} · {formatBytes(
            data.quota.usedBytes,
          )}</span
        >
        <span
          ><span class="dot free"></span>{$_('account.overview.quota_free_label')} · {formatBytes(
            data.quota.remainingBytes,
          )}</span
        >
      </div>
    </div>
  </section>

  <!-- Recent Uploads -->
  <section class="panel">
    <div class="panel-h">
      <h2>{$_('account.overview.recent_uploads')}</h2>
      {#if data.uploads.length > 5}
        <a class="link-btn" href="/account"
          >{$_('account.overview.show_all')} <ChevronRight size={14} /></a
        >
      {/if}
    </div>
    <div class="panel-body table-body">
      {#if data.uploads.length === 0}
        <p class="empty">
          {$_('account.overview.no_uploads')}
          <a href="/">{$_('account.overview.send_file')}</a>.
        </p>
      {:else}
        <table>
          <thead>
            <tr>
              <th>{$_('account.overview.col_share')}</th>
              <th>{$_('account.overview.col_size')}</th>
              <th>{$_('account.overview.col_downloads')}</th>
              <th>{$_('account.overview.col_expiry')}</th>
              <th>{$_('account.overview.col_status')}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {#each recentUploads as upload}
              {@const badge = fileTypeBadge(upload.filename)}
              <tr>
                <td>
                  <div class="file-cell">
                    <div class="file-icon" data-tone={badge.tone}>{badge.label}</div>
                    <span class="file-id" title={upload.id}>{upload.id.slice(0, 12)}…</span>
                  </div>
                </td>
                <td>{formatBytes(upload.totalSizeBytes)}</td>
                <td>
                  {upload.downloadsUsed} /
                  {upload.downloadLimit === 0 ? '∞' : upload.downloadLimit}
                </td>
                <td>{relativeExpiry(upload.expiresAt, upload.expired)}</td>
                <td>
                  {#if upload.expired}
                    <span class="badge badge-queue">{$_('account.overview.badge_expired')}</span>
                  {:else}
                    <span class="badge badge-ok">{$_('account.overview.badge_active')}</span>
                  {/if}
                  {#if upload.passwordProtected}
                    <span class="badge badge-busy" style="margin-left: 4px;">PW</span>
                  {/if}
                </td>
                <td>
                  <div class="row-actions">
                    {#if !upload.expired}
                      <button
                        type="button"
                        title={$_('account.overview.copy_id')}
                        aria-label={$_('account.overview.copy_id')}
                        onclick={() => void copyId_(upload.id)}
                      >
                        {#if copyId === upload.id}
                          <span class="ok">✓</span>
                        {:else}
                          <Copy size={14} />
                        {/if}
                      </button>
                    {:else}
                      <button
                        type="button"
                        title={$_('account.overview.reupload_soon')}
                        aria-label={$_('account.overview.reupload')}
                        disabled
                      >
                        <RefreshCw size={14} />
                      </button>
                    {/if}
                    <button
                      type="button"
                      title={$_('account.overview.delete')}
                      aria-label={$_('account.overview.delete')}
                      onclick={() => void deleteUpload(upload.id)}
                      disabled={deletingId === upload.id}
                      class="danger"
                    >
                      <Trash size={14} />
                    </button>
                  </div>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      {/if}
    </div>
  </section>

  <!-- API Tokens placeholder -->
  <section class="panel">
    <div class="panel-h">
      <h2>{$_('account.overview.tokens_heading')}</h2>
      <button
        type="button"
        class="btn btn-primary btn-sm"
        disabled
        title={$_('account.overview.available_v11')}
      >
        <Plus size={14} />
        {$_('account.overview.tokens_new')}
      </button>
    </div>
    <div class="panel-body empty-tokens">
      <p>
        {$_('account.overview.tokens_desc')}
        <a href="/docs">{$_('account.overview.tokens_api_link')}</a>
        {$_('account.overview.tokens_api_suffix')}
      </p>
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
  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  .crumbs {
    color: var(--muted);
    font-size: 13px;
    margin-bottom: 12px;
  }
  .crumbs a {
    color: var(--brand);
  }
  .hello {
    margin: 0 0 4px;
    font-size: 28px;
    letter-spacing: -0.02em;
  }
  .sub {
    color: var(--muted);
    margin: 0 0 28px;
    font-size: 14px;
  }

  .stats {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 14px;
    margin-bottom: 22px;
  }
  @media (max-width: 760px) {
    .stats {
      grid-template-columns: repeat(2, 1fr);
    }
  }
  .stat-card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    padding: 18px;
    box-shadow: var(--shadow-card);
  }
  .stat-card .label {
    font-size: 11px;
    color: var(--muted);
    text-transform: uppercase;
    letter-spacing: 0.06em;
    margin-bottom: 6px;
    font-weight: 600;
  }
  .stat-card .value {
    font-size: 26px;
    font-weight: 700;
    letter-spacing: -0.02em;
    line-height: 1.1;
  }
  .stat-card .delta {
    font-size: 12px;
    color: var(--muted);
    margin-top: 4px;
  }
  .stat-card .delta.dim {
    color: var(--dim);
  }

  /* Quota */
  .quota {
    margin-bottom: 22px;
  }
  .quota-body {
    padding: 22px;
  }
  .quota-head {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    margin-bottom: 12px;
    gap: 16px;
    flex-wrap: wrap;
  }
  .quota-head h2 {
    margin: 0;
    font-size: 13px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--muted);
    font-weight: 600;
  }
  .quota-head .v {
    font-size: 14px;
    color: var(--muted);
  }
  .quota-head .v b {
    color: var(--text);
  }
  .quota-bar {
    height: 10px;
    background: var(--surface-3);
    border-radius: 9999px;
    overflow: hidden;
    display: flex;
  }
  .quota-bar .seg {
    height: 100%;
    transition: width 0.4s;
  }
  .quota-bar .seg.used {
    background: var(--brand);
  }
  .quota-legend {
    display: flex;
    gap: 18px;
    margin-top: 10px;
    font-size: 12px;
    color: var(--muted);
    flex-wrap: wrap;
  }
  .quota-legend .dot {
    display: inline-block;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    margin-right: 6px;
    vertical-align: -1px;
  }
  .quota-legend .dot.used {
    background: var(--brand);
  }
  .quota-legend .dot.free {
    background: var(--surface-3);
  }

  .panel {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
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
  .panel-body {
    padding: 22px;
  }
  .table-body {
    padding: 0;
    overflow-x: auto;
  }
  .link-btn {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    color: var(--brand);
    font-size: 13px;
    text-decoration: none;
  }

  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 14px;
  }
  th,
  td {
    text-align: left;
    padding: 14px 22px;
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
  .file-cell {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .file-icon {
    width: 28px;
    height: 28px;
    border-radius: 6px;
    background: var(--surface-3);
    color: var(--muted);
    display: grid;
    place-items: center;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.04em;
  }
  .file-icon[data-tone='pdf'] {
    background: color-mix(in srgb, var(--danger) 15%, var(--surface-3));
    color: var(--danger);
  }
  .file-icon[data-tone='img'] {
    background: color-mix(in srgb, var(--warning) 15%, var(--surface-3));
    color: var(--warning);
  }
  .file-icon[data-tone='zip'] {
    background: color-mix(in srgb, var(--brand) 15%, var(--surface-3));
    color: var(--brand-strong);
  }
  .file-icon[data-tone='txt'] {
    background: color-mix(in srgb, var(--muted) 15%, var(--surface-3));
    color: var(--muted);
  }
  .file-id {
    font-family: var(--font-mono);
    font-size: 13px;
    color: var(--text);
  }
  .row-actions {
    display: flex;
    gap: 6px;
    justify-content: flex-end;
  }
  .row-actions button {
    width: 28px;
    height: 28px;
    border-radius: 6px;
    border: 1px solid var(--border);
    background: var(--surface);
    color: var(--muted);
    cursor: pointer;
    display: grid;
    place-items: center;
    font-family: inherit;
    transition:
      color var(--transition-fast),
      border-color var(--transition-fast);
  }
  .row-actions button:hover:not(:disabled) {
    color: var(--text);
    border-color: var(--border-strong);
  }
  .row-actions button.danger:hover:not(:disabled) {
    color: var(--danger);
    border-color: color-mix(in srgb, var(--danger) 30%, var(--border));
  }
  .row-actions button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .row-actions .ok {
    color: var(--success);
    font-size: 16px;
    font-weight: 700;
  }
  .empty {
    color: var(--muted);
    font-size: 14px;
    margin: 0;
  }
  .empty-tokens p {
    margin: 0;
    color: var(--muted);
    font-size: 14px;
    line-height: 1.5;
  }
  .btn-primary:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
</style>
