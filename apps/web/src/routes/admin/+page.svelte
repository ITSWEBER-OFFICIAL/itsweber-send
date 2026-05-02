<script lang="ts">
  import { onMount } from 'svelte';
  import { _ } from 'svelte-i18n';
  import { goto } from '$app/navigation';
  import { auth } from '$lib/stores/auth.svelte.js';
  import type { AdminStats } from '@itsweber-send/shared';

  interface AdminUser {
    id: string;
    email: string;
    role: string;
    createdAt: string;
    lastLoginAt: string | null;
    quotaBytes: number;
  }

  interface AdminData {
    stats: AdminStats;
    users: AdminUser[];
  }

  let data = $state<AdminData | null>(null);
  let loading = $state(true);
  let forbidden = $state(false);

  function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
    return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
  }

  async function load() {
    loading = true;
    try {
      const [statsRes, usersRes] = await Promise.all([
        fetch('/api/v1/admin/stats'),
        fetch('/api/v1/admin/users'),
      ]);
      if (statsRes.status === 401 || usersRes.status === 401) { await goto('/login'); return; }
      if (statsRes.status === 403 || usersRes.status === 403) { forbidden = true; return; }
      if (statsRes.ok && usersRes.ok) {
        const stats = (await statsRes.json()) as AdminStats;
        const users = (await usersRes.json()) as AdminUser[];
        data = { stats, users };
      }
    } finally {
      loading = false;
    }
  }

  onMount(() => {
    if (!auth.loaded) {
      const check = setInterval(() => {
        if (auth.loaded) {
          clearInterval(check);
          if (!auth.user) { void goto('/login'); return; }
          void load();
        }
      }, 50);
    } else {
      if (!auth.user) { void goto('/login'); return; }
      void load();
    }
  });
</script>

<main class="page">
  {#if loading}
    <div class="center">
      <span class="spinner" aria-hidden="true"></span>
    </div>

  {:else if forbidden}
    <div class="center">
      <p class="forbidden-text">403 — Forbidden</p>
    </div>

  {:else if data}
    <div class="header-row">
      <h1 class="title">{$_('admin.title')}</h1>
    </div>

    <!-- Stats card -->
    <div class="card stats-card">
      <p class="section-label">{$_('admin.stats_title')}</p>
      <div class="stats-grid">
        <div class="stat-item">
          <span class="stat-value">{data.stats.totalUsers}</span>
          <span class="stat-label">{$_('admin.total_users')}</span>
        </div>
        <div class="stat-item">
          <span class="stat-value">{data.stats.totalShares}</span>
          <span class="stat-label">{$_('admin.total_shares')}</span>
        </div>
        <div class="stat-item">
          <span class="stat-value">{data.stats.activeShares}</span>
          <span class="stat-label">{$_('admin.active_shares')}</span>
        </div>
        <div class="stat-item">
          <span class="stat-value">{formatBytes(data.stats.totalStorageBytes)}</span>
          <span class="stat-label">{$_('admin.total_storage')}</span>
        </div>
      </div>
    </div>

    <!-- Users card -->
    <div class="card users-card">
      <p class="section-label">{$_('admin.users_title')}</p>
      {#if data.users.length === 0}
        <p class="empty">—</p>
      {:else}
        <div class="table-wrap">
          <table class="users-table">
            <thead>
              <tr>
                <th>{$_('admin.user_email')}</th>
                <th>{$_('admin.user_role')}</th>
                <th>{$_('admin.user_quota')}</th>
                <th>{$_('admin.user_created')}</th>
                <th>{$_('admin.user_last_login')}</th>
              </tr>
            </thead>
            <tbody>
              {#each data.users as user}
                <tr>
                  <td class="td-email">{user.email}</td>
                  <td>
                    <span class="role-badge" class:role-admin={user.role === 'admin'}>
                      {user.role === 'admin' ? $_('admin.role_admin') : $_('admin.role_user')}
                    </span>
                  </td>
                  <td class="td-mono">{formatBytes(user.quotaBytes)}</td>
                  <td class="td-date">{new Date(user.createdAt).toLocaleDateString()}</td>
                  <td class="td-date">
                    {user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleDateString() : $_('admin.never')}
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      {/if}
    </div>
  {/if}
</main>

<style>
  .page { max-width: 860px; margin: 0 auto; padding: 60px 24px 80px; }

  .center { display: flex; justify-content: center; padding: 80px; }
  .spinner {
    width: 28px; height: 28px;
    border: 2.5px solid var(--border);
    border-top-color: var(--brand);
    border-radius: 50%;
    animation: spin 0.7s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }
  .forbidden-text { color: var(--muted); font-size: 16px; }

  .header-row { display: flex; align-items: baseline; gap: 12px; margin-bottom: 24px; }
  .title { margin: 0; font-size: 24px; font-weight: 700; letter-spacing: -0.02em; }

  .card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 16px;
    padding: 20px 22px;
    box-shadow: 0 2px 12px rgba(0,0,0,0.05);
    margin-bottom: 16px;
  }
  .section-label {
    font-size: 11px; text-transform: uppercase; letter-spacing: 0.07em;
    color: var(--muted); margin: 0 0 16px; font-weight: 600;
  }

  /* Stats */
  .stats-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 12px;
  }
  .stat-item {
    display: flex; flex-direction: column; gap: 4px;
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 14px 16px;
  }
  .stat-value { font-size: 22px; font-weight: 700; letter-spacing: -0.02em; }
  .stat-label { font-size: 12px; color: var(--muted); }

  /* Users table */
  .empty { color: var(--muted); font-size: 14px; margin: 0; }
  .table-wrap { overflow-x: auto; }
  .users-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;
  }
  .users-table th {
    text-align: left;
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--muted);
    padding: 0 12px 10px 0;
    white-space: nowrap;
    border-bottom: 1px solid var(--border);
  }
  .users-table td {
    padding: 10px 12px 10px 0;
    border-bottom: 1px solid var(--border);
    vertical-align: middle;
  }
  .users-table tbody tr:last-child td { border-bottom: none; }
  .td-email { font-weight: 500; max-width: 260px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .td-mono { font-family: var(--font-mono); font-size: 12px; }
  .td-date { font-size: 12px; color: var(--muted); white-space: nowrap; }

  .role-badge {
    display: inline-block;
    border-radius: 4px;
    padding: 1px 7px;
    font-size: 11px;
    font-weight: 600;
    background: var(--surface-2);
    border: 1px solid var(--border);
    color: var(--muted);
  }
  .role-badge.role-admin {
    background: color-mix(in srgb, var(--brand) 12%, transparent);
    border-color: color-mix(in srgb, var(--brand) 30%, transparent);
    color: var(--brand);
  }

  @media (max-width: 600px) {
    .page { padding: 32px 16px 60px; }
    .card { padding: 16px; }
    .stats-grid { grid-template-columns: repeat(2, 1fr); }
  }
</style>
