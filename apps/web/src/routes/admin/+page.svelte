<script lang="ts">
  import { onMount } from 'svelte';
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

  function relativeDate(iso: string | null): string {
    if (!iso) return 'nie';
    const d = new Date(iso).getTime();
    const diff = Date.now() - d;
    const minutes = Math.floor(diff / (1000 * 60));
    if (minutes < 1) return 'gerade eben';
    if (minutes < 60) return `vor ${minutes} min`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `vor ${hours} h`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `vor ${days} ${days === 1 ? 'Tag' : 'Tagen'}`;
    return new Date(iso).toLocaleDateString();
  }

  async function load() {
    loading = true;
    try {
      const [statsRes, usersRes] = await Promise.all([
        fetch('/api/v1/admin/stats'),
        fetch('/api/v1/admin/users'),
      ]);
      if (statsRes.status === 401 || usersRes.status === 401) {
        await goto('/login');
        return;
      }
      if (statsRes.status === 403 || usersRes.status === 403) {
        forbidden = true;
        return;
      }
      if (statsRes.ok && usersRes.ok) {
        const stats = (await statsRes.json()) as AdminStats;
        const usersBody = (await usersRes.json()) as { total: number; users: AdminUser[] };
        data = { stats, users: usersBody.users };
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

  const expiredCount = $derived.by(() => {
    if (!data) return 0;
    return Math.max(0, data.stats.totalShares - data.stats.activeShares);
  });
</script>

{#if loading}
  <div class="center"><span class="spinner" aria-hidden="true"></span></div>
{:else if forbidden}
  <div class="forbidden">
    <h1>403 — Forbidden</h1>
    <p>Dieses Konto hat keine Admin-Rolle.</p>
  </div>
{:else if data}
  <div class="crumbs"><a href="/admin">Admin</a> · Übersicht</div>
  <h1 class="hello">Admin-Dashboard</h1>
  <p class="sub">
    System-Status, Nutzer und Storage-Auslastung. Die Statistiken werden live vom Server geladen.
  </p>

  <!-- Stat Cards -->
  <div class="stats">
    <div class="stat-card">
      <div class="label">Nutzer</div>
      <div class="value">{data.stats.totalUsers}</div>
      <div class="delta">registrierte Konten</div>
    </div>
    <div class="stat-card">
      <div class="label">Aktive Shares</div>
      <div class="value">{data.stats.activeShares}</div>
      <div class="delta">{expiredCount} bereits abgelaufen</div>
    </div>
    <div class="stat-card">
      <div class="label">Shares gesamt</div>
      <div class="value">{data.stats.totalShares}</div>
      <div class="delta">über alle Nutzer</div>
    </div>
    <div class="stat-card">
      <div class="label">Speicher</div>
      <div class="value">{formatBytes(data.stats.totalStorageBytes)}</div>
      <div class="delta">Gesamtbelegung</div>
    </div>
  </div>

  <!-- Users Table -->
  <section class="panel">
    <div class="panel-h">
      <h2>Nutzer</h2>
      <span class="hint-pill">{data.users.length} Konten</span>
    </div>
    <div class="panel-body table-body">
      {#if data.users.length === 0}
        <p class="empty">Keine Nutzer registriert.</p>
      {:else}
        <table>
          <thead>
            <tr>
              <th>Konto</th>
              <th>Rolle</th>
              <th>Quota</th>
              <th>Erstellt</th>
              <th>Letzter Login</th>
            </tr>
          </thead>
          <tbody>
            {#each data.users as user}
              <tr>
                <td>
                  <div class="user-cell">
                    <span class="avatar">{(user.email[0] ?? '?').toUpperCase()}</span>
                    <div class="user-stack">
                      <div class="user-email" title={user.email}>{user.email}</div>
                      <div class="user-id" title={user.id}>{user.id.slice(0, 12)}…</div>
                    </div>
                  </div>
                </td>
                <td>
                  {#if user.role === 'admin'}
                    <span class="badge badge-busy">Admin</span>
                  {:else}
                    <span class="badge badge-queue">Nutzer</span>
                  {/if}
                </td>
                <td class="mono">{formatBytes(user.quotaBytes)}</td>
                <td class="muted">{new Date(user.createdAt).toLocaleDateString()}</td>
                <td class="muted">{relativeDate(user.lastLoginAt)}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      {/if}
    </div>
  </section>

  <!-- System placeholder -->
  <section class="panel">
    <div class="panel-h">
      <h2>System</h2>
    </div>
    <div class="panel-body">
      <div class="kv">
        <div>
          <span class="k">Health-Check</span><span class="v"
            ><a href="/health" target="_blank" rel="noopener noreferrer">/health</a></span
          >
        </div>
        <div>
          <span class="k">Ready-Check</span><span class="v"
            ><a href="/ready" target="_blank" rel="noopener noreferrer">/ready</a></span
          >
        </div>
        <div>
          <span class="k">OpenAPI</span><span class="v"
            ><a href="/api/v1/openapi.json" target="_blank" rel="noopener noreferrer"
              >/api/v1/openapi.json</a
            ></span
          >
        </div>
        <div>
          <span class="k">Logs</span><span class="v"
            >via <code class="mono">docker logs itsweber-send</code></span
          >
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
  .hello {
    margin: 0 0 4px;
    font-size: 28px;
    letter-spacing: -0.02em;
  }
  .sub {
    color: var(--muted);
    margin: 0 0 28px;
    font-size: 14px;
    max-width: 640px;
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
  .hint-pill {
    color: var(--dim);
    font-size: 12px;
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
    white-space: nowrap;
  }
  tbody tr:hover {
    background: var(--surface-2);
  }
  tbody tr:last-child td {
    border-bottom: 0;
  }
  .user-cell {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .avatar {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    background: linear-gradient(135deg, var(--brand), var(--brand-strong));
    color: #0a1a26;
    display: grid;
    place-items: center;
    font-weight: 700;
    font-size: 13px;
    flex-shrink: 0;
  }
  .user-stack {
    min-width: 0;
  }
  .user-email {
    font-weight: 500;
    color: var(--text);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 260px;
  }
  .user-id {
    font-family: var(--font-mono);
    font-size: 11px;
    color: var(--dim);
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

  .kv {
    display: grid;
    gap: 10px;
  }
  .kv > div {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 8px 0;
    border-bottom: 1px solid var(--border);
    font-size: 14px;
  }
  .kv > div:last-child {
    border-bottom: 0;
  }
  .kv .k {
    color: var(--muted);
  }
  .kv .v {
    font-family: var(--font-mono);
    font-size: 13px;
  }
  .kv .v code {
    background: var(--surface-2);
    padding: 2px 6px;
    border-radius: 4px;
  }
</style>
