<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { auth } from '$lib/stores/auth.svelte.js';
  import { _ } from 'svelte-i18n';
  import RefreshCw from '$lib/components/icons/RefreshCw.svelte';
  import Gauge from '$lib/components/icons/Gauge.svelte';
  import User from '$lib/components/icons/User.svelte';
  import Files from '$lib/components/icons/Files.svelte';

  interface HealthData {
    totalUsers: number;
    totalShares: number;
    activeShares: number;
    totalStorageBytes: number;
    uptime: number;
    nodeVersion: string;
    memoryMB: number;
    platform: string;
  }

  let data = $state<HealthData | null>(null);
  let loading = $state(true);
  let refreshing = $state(false);
  let forbidden = $state(false);
  let error = $state<string | null>(null);

  function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
    return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
  }

  function formatDuration(seconds: number): string {
    if (seconds < 60) return `${Math.floor(seconds)}s`;
    const d = Math.floor(seconds / 86400);
    const h = Math.floor((seconds % 86400) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const parts: string[] = [];
    if (d > 0) parts.push(`${d}d`);
    if (h > 0) parts.push(`${h}h`);
    if (m > 0 || parts.length === 0) parts.push(`${m}m`);
    return parts.join(' ');
  }

  async function load(isRefresh = false) {
    if (isRefresh) {
      refreshing = true;
    } else {
      loading = true;
    }
    error = null;
    try {
      const res = await fetch('/api/v1/admin/health');
      if (res.status === 401) {
        await goto('/login');
        return;
      }
      if (res.status === 403) {
        forbidden = true;
        return;
      }
      if (res.ok) {
        data = (await res.json()) as HealthData;
      } else {
        error = `HTTP ${res.status}`;
      }
    } catch (e) {
      error = e instanceof Error ? e.message : $_('common.loading');
    } finally {
      loading = false;
      refreshing = false;
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
  <div class="crumbs"><a href="/admin">Admin</a> · {$_('admin.health.breadcrumb')}</div>
  <div class="page-header">
    <div>
      <h1 class="page-title">{$_('admin.health.title')}</h1>
      <p class="page-sub">{$_('admin.health.sub')}</p>
    </div>
    <button class="btn-ghost" onclick={() => load(true)} disabled={refreshing}>
      <RefreshCw size={14} />
      {refreshing ? $_('admin.health.refreshing') : $_('admin.health.refresh')}
    </button>
  </div>

  {#if error}
    <div class="error-banner">{error}</div>
  {/if}

  {#if data}
    <!-- Stat cards -->
    <div class="stats">
      <div class="stat-card">
        <div class="stat-icon"><User size={18} /></div>
        <div class="stat-body">
          <div class="label">{$_('admin.health.users_label')}</div>
          <div class="value">{data.totalUsers}</div>
          <div class="delta">{$_('admin.health.stat_registered')}</div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon"><Files size={18} /></div>
        <div class="stat-body">
          <div class="label">{$_('admin.health.shares_label')}</div>
          <div class="value">{data.activeShares}</div>
          <div class="delta">
            {$_('admin.health.stat_shares_total', { values: { count: data.totalShares } })}
          </div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon"><Gauge size={18} /></div>
        <div class="stat-body">
          <div class="label">{$_('admin.health.storage_label')}</div>
          <div class="value">{formatBytes(data.totalStorageBytes)}</div>
          <div class="delta">{$_('admin.health.stat_storage_total')}</div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon">
          <span class="uptime-dot" aria-hidden="true"></span>
        </div>
        <div class="stat-body">
          <div class="label">{$_('admin.health.uptime_label')}</div>
          <div class="value">{formatDuration(data.uptime)}</div>
          <div class="delta">{$_('admin.health.stat_uptime_since')}</div>
        </div>
      </div>
    </div>

    <!-- System info -->
    <section class="panel">
      <div class="panel-h">
        <h2>{$_('admin.health.system_info')}</h2>
      </div>
      <div class="panel-body">
        <div class="kv">
          <div>
            <span class="k">Node.js</span>
            <span class="v mono">{data.nodeVersion}</span>
          </div>
          <div>
            <span class="k">{$_('admin.health.platform')}</span>
            <span class="v mono">{data.platform}</span>
          </div>
          <div>
            <span class="k">{$_('admin.health.ram')}</span>
            <span class="v mono">{data.memoryMB.toFixed(1)} MB</span>
          </div>
          <div>
            <span class="k">{$_('admin.health.shares_total')}</span>
            <span class="v mono">{data.totalShares}</span>
          </div>
          <div>
            <span class="k">{$_('admin.health.shares_active')}</span>
            <span class="v mono">{data.activeShares}</span>
          </div>
          <div>
            <span class="k">{$_('admin.health.expired_shares')}</span>
            <span class="v mono">{Math.max(0, data.totalShares - data.activeShares)}</span>
          </div>
        </div>
      </div>
    </section>
  {/if}
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
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    margin-bottom: 20px;
    flex-wrap: wrap;
    gap: 12px;
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

  .error-banner {
    background: var(--surface);
    border: 1px solid var(--danger);
    border-radius: var(--radius-sm);
    color: var(--danger);
    padding: 12px 16px;
    font-size: 14px;
    margin-bottom: 20px;
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
  @media (max-width: 420px) {
    .stats {
      grid-template-columns: 1fr;
    }
  }

  .stat-card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 18px;
    box-shadow: var(--shadow-card);
    display: flex;
    gap: 14px;
    align-items: flex-start;
  }
  .stat-icon {
    color: var(--brand);
    display: flex;
    align-items: center;
    margin-top: 3px;
    flex-shrink: 0;
  }
  .uptime-dot {
    display: inline-block;
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: var(--brand);
    box-shadow: 0 0 0 3px var(--brand-soft);
    margin-top: 4px;
  }
  .stat-body {
    min-width: 0;
  }
  .label {
    font-size: 11px;
    color: var(--muted);
    text-transform: uppercase;
    letter-spacing: 0.06em;
    margin-bottom: 6px;
    font-weight: 600;
  }
  .value {
    font-size: 26px;
    font-weight: 700;
    letter-spacing: -0.02em;
    line-height: 1.1;
  }
  .delta {
    font-size: 12px;
    color: var(--muted);
    margin-top: 4px;
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
  .panel-body {
    padding: 22px;
  }

  .kv {
    display: grid;
    gap: 0;
  }
  .kv > div {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 11px 0;
    border-bottom: 1px solid var(--border);
    font-size: 14px;
  }
  .kv > div:last-child {
    border-bottom: 0;
  }
  .k {
    color: var(--muted);
  }
  .v {
    font-family: var(--font-mono);
    font-size: 13px;
  }
  .mono {
    font-family: var(--font-mono);
    font-size: 13px;
  }

  .btn-ghost {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 7px 14px;
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
</style>
