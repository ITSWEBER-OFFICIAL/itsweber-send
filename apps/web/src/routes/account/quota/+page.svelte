<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { auth } from '$lib/stores/auth.svelte.js';
  import Gauge from '$lib/components/icons/Gauge.svelte';
  import RefreshCw from '$lib/components/icons/RefreshCw.svelte';

  interface Upload {
    id: string;
    totalSizeBytes: number;
    expiresAt: string;
    expired: boolean;
    downloadsUsed: number;
    downloadLimit: number;
    passwordProtected: boolean;
  }

  interface QuotaData {
    uploads: Upload[];
    quota: { totalBytes: number; usedBytes: number; remainingBytes: number };
  }

  let data = $state<QuotaData | null>(null);
  let loading = $state(true);
  let error = $state<string | null>(null);

  function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
    return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
  }

  function pct(used: number, total: number): number {
    if (total === 0) return 0;
    return Math.min(100, (used / total) * 100);
  }

  function formatExpiry(iso: string, expired: boolean): string {
    if (expired) return 'Abgelaufen';
    return new Date(iso).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' });
  }

  async function load() {
    loading = true;
    error = null;
    try {
      const res = await fetch('/api/v1/account/uploads');
      if (res.status === 401) {
        await goto('/login');
        return;
      }
      if (!res.ok) {
        error = `Fehler beim Laden (${res.status})`;
        return;
      }
      const json = (await res.json()) as QuotaData;
      // Sort uploads by size descending
      json.uploads = [...json.uploads].sort((a, b) => b.totalSizeBytes - a.totalSizeBytes);
      data = json;
    } catch {
      error = 'Verbindungsfehler. Bitte Seite neu laden.';
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

  const activeCount = $derived((data?.uploads ?? []).filter((u) => !u.expired).length);
  const usedPct = $derived(data ? pct(data.quota.usedBytes, data.quota.totalBytes) : 0);
  const pctLabel = $derived(usedPct.toFixed(1) + ' %');
</script>

<div class="page">
  <header class="page-header">
    <Gauge size={20} />
    <div>
      <h1>Quota &amp; Limits</h1>
      <p class="sub">Überblick über deinen genutzten Speicherplatz und aktive Shares.</p>
    </div>
    <button
      type="button"
      class="reload-btn"
      onclick={() => void load()}
      disabled={loading}
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
  {:else if data}
    <!-- Quota bar -->
    <section class="panel">
      <div class="panel-head">
        <h2>Speicher-Quota</h2>
        <span class="pct-badge" class:warn={usedPct >= 80} class:danger={usedPct >= 95}
          >{pctLabel}</span
        >
      </div>
      <div class="panel-body">
        <div
          class="quota-bar-wrap"
          role="progressbar"
          aria-valuenow={usedPct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Speicherbelegung"
        >
          <div class="quota-bar">
            <div
              class="quota-seg"
              class:warn={usedPct >= 80}
              class:danger={usedPct >= 95}
              style="width: {usedPct}%"
            ></div>
          </div>
          <div class="quota-labels">
            <span>0</span>
            <span>{formatBytes(data.quota.totalBytes)}</span>
          </div>
        </div>

        <div class="stats-grid">
          <div class="stat">
            <div class="stat-label">Belegt</div>
            <div class="stat-value">{formatBytes(data.quota.usedBytes)}</div>
          </div>
          <div class="stat">
            <div class="stat-label">Gesamt</div>
            <div class="stat-value">{formatBytes(data.quota.totalBytes)}</div>
          </div>
          <div class="stat">
            <div class="stat-label">Verfügbar</div>
            <div class="stat-value">{formatBytes(data.quota.remainingBytes)}</div>
          </div>
          <div class="stat">
            <div class="stat-label">Aktive Shares</div>
            <div class="stat-value">{activeCount}</div>
          </div>
        </div>
      </div>
    </section>

    <!-- Shares table -->
    <section class="panel">
      <div class="panel-head">
        <h2>Shares nach Größe</h2>
        <span class="count-badge">{data.uploads.length}</span>
      </div>
      {#if data.uploads.length === 0}
        <div class="panel-body">
          <p class="empty">Noch keine Shares vorhanden.</p>
        </div>
      {:else}
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Share-ID</th>
                <th>Größe</th>
                <th>Ablauf</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {#each data.uploads as upload (upload.id)}
                <tr class:expired={upload.expired}>
                  <td>
                    <code class="mono">{upload.id.slice(0, 16)}&hellip;</code>
                  </td>
                  <td class="num">{formatBytes(upload.totalSizeBytes)}</td>
                  <td class="date">{formatExpiry(upload.expiresAt, upload.expired)}</td>
                  <td>
                    {#if upload.expired}
                      <span class="badge badge-expired">Abgelaufen</span>
                    {:else}
                      <span class="badge badge-active">Aktiv</span>
                    {/if}
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
    max-width: 860px;
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
    margin-bottom: 20px;
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

  .pct-badge {
    font-size: 12px;
    font-weight: 700;
    padding: 2px 8px;
    border-radius: 9999px;
    background: var(--brand-soft);
    color: var(--brand-strong);
    font-family: var(--font-mono);
  }
  .pct-badge.warn {
    background: color-mix(in srgb, var(--warning, #f59e0b) 15%, var(--surface));
    color: var(--warning, #f59e0b);
  }
  .pct-badge.danger {
    background: color-mix(in srgb, var(--danger) 15%, var(--surface));
    color: var(--danger);
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

  .quota-bar-wrap {
    margin-bottom: 22px;
  }
  .quota-bar {
    height: 12px;
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: 9999px;
    overflow: hidden;
  }
  .quota-seg {
    height: 100%;
    background: var(--brand);
    border-radius: 9999px;
    transition: width 0.4s ease;
  }
  .quota-seg.warn {
    background: var(--warning, #f59e0b);
  }
  .quota-seg.danger {
    background: var(--danger);
  }
  .quota-labels {
    display: flex;
    justify-content: space-between;
    margin-top: 5px;
    font-size: 11px;
    color: var(--dim);
  }

  .stats-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 12px;
  }
  @media (max-width: 640px) {
    .stats-grid {
      grid-template-columns: repeat(2, 1fr);
    }
  }
  .stat {
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    padding: 14px 16px;
  }
  .stat-label {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--dim);
    font-weight: 600;
    margin-bottom: 6px;
  }
  .stat-value {
    font-size: 18px;
    font-weight: 700;
    letter-spacing: -0.01em;
    color: var(--text);
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
    padding: 13px 20px;
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
  tbody tr.expired td {
    opacity: 0.55;
  }
  .mono {
    font-family: var(--font-mono);
    font-size: 12px;
  }
  .num {
    font-family: var(--font-mono);
    font-size: 13px;
  }
  .date {
    font-size: 13px;
    color: var(--muted);
  }
  .badge {
    display: inline-block;
    font-size: 11px;
    font-weight: 600;
    padding: 2px 8px;
    border-radius: 9999px;
  }
  .badge-active {
    background: color-mix(in srgb, var(--brand) 15%, var(--surface));
    color: var(--brand-strong);
  }
  .badge-expired {
    background: var(--surface-2);
    color: var(--dim);
    border: 1px solid var(--border);
  }
  .empty {
    margin: 0;
    color: var(--muted);
    font-size: 14px;
  }
</style>
