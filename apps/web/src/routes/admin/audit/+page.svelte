<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { auth } from '$lib/stores/auth.svelte.js';
  import { _ } from 'svelte-i18n';

  interface AuditEntry {
    id: string;
    user_id: string | null;
    action: string;
    resource: string | null;
    ip: string | null;
    created_at: string;
  }

  interface AuditResponse {
    total: number;
    entries: AuditEntry[];
  }

  const ACTION_LABEL_KEYS: Record<string, string> = {
    'user.registered': 'admin.audit.action.user_registered',
    'user.login': 'admin.audit.action.user_login',
    'user.logout': 'admin.audit.action.user_logout',
    'user.login.failed': 'admin.audit.action.user_login_failed',
    'user.password.changed': 'admin.audit.action.user_password_changed',
    'user.email.changed': 'admin.audit.action.user_email_changed',
    'user.totp.enabled': 'admin.audit.action.user_totp_enabled',
    'user.totp.disabled': 'admin.audit.action.user_totp_disabled',
    'share.created': 'admin.audit.action.share_created',
    'share.deleted': 'admin.audit.action.share_deleted',
    'share.downloaded': 'admin.audit.action.share_downloaded',
    'share.expired': 'admin.audit.action.share_expired',
    'admin.user.updated': 'admin.audit.action.admin_user_updated',
    'admin.user.deleted': 'admin.audit.action.admin_user_deleted',
    'admin.share.deleted': 'admin.audit.action.admin_share_deleted',
    'admin.settings.updated': 'admin.audit.action.admin_settings_updated',
  };

  function actionLabel(action: string): string {
    const key = ACTION_LABEL_KEYS[action];
    if (key) return $_(key);
    return $_('admin.audit.action.unknown', { values: { action } });
  }

  let total = $state(0);
  let entries = $state<AuditEntry[]>([]);
  let loading = $state(true);
  let loadingMore = $state(false);
  let forbidden = $state(false);
  let offset = $state(0);
  const limit = 50;

  function formatDateTime(iso: string): string {
    const d = new Date(iso);
    return (
      d.toLocaleDateString() +
      ' ' +
      d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
    );
  }

  function truncateId(id: string | null): string {
    if (!id) return $_('admin.audit.anon');
    return id.length > 12 ? id.slice(0, 12) + '...' : id;
  }

  function isAdminAction(action: string): boolean {
    return action.startsWith('admin.');
  }

  async function load(reset = false) {
    if (reset) {
      offset = 0;
      entries = [];
      loading = true;
    } else {
      loadingMore = true;
    }
    try {
      const res = await fetch(`/api/v1/admin/audit?limit=${limit}&offset=${offset}`);
      if (res.status === 401) {
        await goto('/login');
        return;
      }
      if (res.status === 403) {
        forbidden = true;
        return;
      }
      if (res.ok) {
        const body = (await res.json()) as AuditResponse;
        total = body.total;
        entries = reset ? body.entries : [...entries, ...body.entries];
        offset = entries.length;
      }
    } finally {
      loading = false;
      loadingMore = false;
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
    <p>{$_('admin.access_denied')}</p>
  </div>
{:else}
  <div class="crumbs"><a href="/admin">Admin</a> · {$_('admin.audit.breadcrumb')}</div>
  <div class="page-header">
    <div>
      <h1 class="page-title">{$_('admin.audit.title')}</h1>
      <p class="page-sub">{$_('admin.audit.entries_total', { values: { total } })}</p>
    </div>
  </div>

  <section class="panel">
    <div class="panel-h">
      <h2>{$_('admin.audit.activities')}</h2>
      <span class="hint-pill"
        >{$_('admin.audit.entries_loaded', { values: { count: entries.length } })}</span
      >
    </div>
    <div class="table-body">
      {#if entries.length === 0}
        <p class="empty">{$_('admin.audit.no_entries')}</p>
      {:else}
        <table>
          <thead>
            <tr>
              <th>{$_('admin.audit.col_timestamp')}</th>
              <th>{$_('admin.audit.col_user')}</th>
              <th>{$_('admin.audit.col_action')}</th>
              <th>{$_('admin.audit.col_resource')}</th>
              <th>{$_('admin.audit.col_ip')}</th>
            </tr>
          </thead>
          <tbody>
            {#each entries as entry (entry.id)}
              <tr>
                <td class="mono timestamp">{formatDateTime(entry.created_at)}</td>
                <td>
                  <span class="user-id" title={entry.user_id ?? undefined}
                    >{truncateId(entry.user_id)}</span
                  >
                </td>
                <td>
                  <span class="action-badge" class:admin-action={isAdminAction(entry.action)}>
                    {actionLabel(entry.action)}
                  </span>
                </td>
                <td class="mono resource">
                  {entry.resource ?? '-'}
                </td>
                <td class="mono ip">{entry.ip ?? '-'}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      {/if}
    </div>

    {#if entries.length < total}
      <div class="load-more">
        <button class="btn-ghost" onclick={() => load(false)} disabled={loadingMore}>
          {#if loadingMore}{$_('admin.audit.loading_more')}{:else}{$_('admin.audit.load_more', {
              values: { count: total - entries.length },
            })}{/if}
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
    padding: 12px 22px;
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

  .mono {
    font-family: var(--font-mono);
    font-size: 13px;
  }
  .timestamp {
    color: var(--muted);
    white-space: nowrap;
  }
  .user-id {
    font-family: var(--font-mono);
    font-size: 12px;
    color: var(--dim);
  }

  .resource {
    color: var(--muted);
    max-width: 180px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .ip {
    color: var(--dim);
    white-space: nowrap;
  }

  .action-badge {
    display: inline-block;
    font-size: 12px;
    padding: 2px 8px;
    border-radius: 99px;
    background: var(--surface-2);
    color: var(--text);
  }
  .action-badge.admin-action {
    background: var(--brand-soft);
    color: var(--brand-strong);
  }

  .empty {
    color: var(--muted);
    font-size: 14px;
    margin: 22px;
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

  .load-more {
    padding: 16px 22px;
    border-top: 1px solid var(--border);
    display: flex;
    justify-content: center;
  }
</style>
