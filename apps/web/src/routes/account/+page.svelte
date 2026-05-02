<script lang="ts">
  import { onMount } from 'svelte';
  import { _ } from 'svelte-i18n';
  import { goto } from '$app/navigation';
  import { auth } from '$lib/stores/auth.svelte.js';
  import type { AccountUpload } from '@itsweber-send/shared';

  interface AccountData {
    uploads: AccountUpload[];
    quota: { totalBytes: number; usedBytes: number; remainingBytes: number };
  }

  let data = $state<AccountData | null>(null);
  let loading = $state(true);
  let deletingId = $state<string | null>(null);

  function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
    return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
  }

  async function load() {
    loading = true;
    try {
      const res = await fetch('/api/v1/account/uploads');
      if (res.status === 401) { await goto('/login'); return; }
      if (res.ok) data = (await res.json()) as AccountData;
    } finally {
      loading = false;
    }
  }

  async function deleteUpload(id: string) {
    if (deletingId) return;
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
      // Wait for auth to load before deciding to redirect
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

  function quotaPct(used: number, total: number): number {
    if (total === 0) return 0;
    return Math.min(100, Math.round((used / total) * 100));
  }
</script>

<main class="page">
  {#if loading}
    <div class="center">
      <span class="spinner" aria-hidden="true"></span>
    </div>

  {:else if data}
    <div class="header-row">
      <h1 class="title">{$_('account.title')}</h1>
      {#if auth.user}
        <span class="email-badge">{auth.user.email}</span>
      {/if}
    </div>

    <!-- Quota card -->
    <div class="card quota-card">
      <p class="section-label">{$_('account.quota_label')}</p>
      <div class="quota-bar-wrap">
        <div class="quota-bar" style="width: {quotaPct(data.quota.usedBytes, data.quota.totalBytes)}%"></div>
      </div>
      <p class="quota-text">
        {formatBytes(data.quota.usedBytes)} / {formatBytes(data.quota.totalBytes)}
        ({quotaPct(data.quota.usedBytes, data.quota.totalBytes)}%)
      </p>
    </div>

    <!-- Uploads list -->
    <div class="card uploads-card">
      <p class="section-label">{$_('account.uploads_title')}</p>
      {#if data.uploads.length === 0}
        <p class="empty">{$_('account.no_uploads')}</p>
      {:else}
        <ul class="uploads-list">
          {#each data.uploads as upload}
            <li class="upload-entry" class:expired={upload.expired}>
              <div class="upload-meta">
                <span class="upload-id">{upload.id.slice(0, 12)}…</span>
                <span class="upload-size">{formatBytes(upload.totalSizeBytes)}</span>
                {#if upload.expired}
                  <span class="badge badge--expired">{$_('account.expired_label')}</span>
                {/if}
                {#if upload.passwordProtected}
                  <span class="badge badge--lock">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"
                         stroke-linecap="round" stroke-linejoin="round" width="11" height="11" aria-hidden="true">
                      <rect x="3" y="11" width="18" height="11" rx="2"/>
                      <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                    </svg>
                  </span>
                {/if}
              </div>
              <div class="upload-details">
                <span class="upload-detail">
                  {$_('account.expires')} {new Date(upload.expiresAt).toLocaleDateString()}
                </span>
                <span class="upload-detail">
                  {upload.downloadLimit === 0
                    ? $_('account.downloads_unlimited', { values: { used: upload.downloadsUsed } })
                    : $_('account.downloads', { values: { used: upload.downloadsUsed, limit: upload.downloadLimit } })}
                </span>
              </div>
              <div class="upload-actions">
                {#if !upload.expired}
                  <a class="btn-link" href="/d/{upload.id}" target="_blank" rel="noopener" aria-label="{$_('account.open_upload')} {upload.id}">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"
                         stroke-linecap="round" stroke-linejoin="round" width="13" height="13" aria-hidden="true">
                      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                      <polyline points="15 3 21 3 21 9"/>
                      <line x1="10" y1="14" x2="21" y2="3"/>
                    </svg>
                  </a>
                {/if}
                <button
                  class="btn-delete"
                  onclick={() => void deleteUpload(upload.id)}
                  disabled={deletingId === upload.id}
                  aria-label="{$_('account.delete_upload')} {upload.id}"
                >
                  {#if deletingId === upload.id}
                    <span class="spinner-sm" aria-hidden="true"></span>
                  {:else}
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"
                         stroke-linecap="round" stroke-linejoin="round" width="14" height="14" aria-hidden="true">
                      <polyline points="3 6 5 6 21 6"/>
                      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                      <path d="M10 11v6"/>
                      <path d="M14 11v6"/>
                      <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
                    </svg>
                  {/if}
                </button>
              </div>
            </li>
          {/each}
        </ul>
      {/if}
    </div>
  {/if}
</main>

<style>
  .page { max-width: 680px; margin: 0 auto; padding: 60px 24px 80px; }

  .center { display: flex; justify-content: center; padding: 80px; }
  .spinner {
    width: 28px; height: 28px;
    border: 2.5px solid var(--border);
    border-top-color: var(--brand);
    border-radius: 50%;
    animation: spin 0.7s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }
  .spinner-sm {
    width: 13px; height: 13px;
    border: 2px solid var(--border);
    border-top-color: var(--brand);
    border-radius: 50%;
    animation: spin 0.7s linear infinite;
  }

  .header-row { display: flex; align-items: baseline; gap: 12px; margin-bottom: 24px; flex-wrap: wrap; }
  .title { margin: 0; font-size: 24px; font-weight: 700; letter-spacing: -0.02em; }
  .email-badge {
    font-size: 13px; color: var(--muted);
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: 20px;
    padding: 2px 10px;
  }

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
    color: var(--muted); margin: 0 0 12px; font-weight: 600;
  }

  /* Quota */
  .quota-bar-wrap {
    height: 8px;
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: 99px;
    overflow: hidden;
    margin-bottom: 8px;
  }
  .quota-bar {
    height: 100%;
    background: var(--brand);
    border-radius: 99px;
    transition: width 0.3s ease;
    min-width: 2px;
  }
  .quota-text { font-size: 13px; color: var(--muted); margin: 0; }

  /* Uploads */
  .empty { color: var(--muted); font-size: 14px; margin: 0; }
  .uploads-list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 8px; }
  .upload-entry {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 12px;
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: 10px;
    flex-wrap: wrap;
  }
  .upload-entry.expired { opacity: 0.55; }

  .upload-meta { display: flex; align-items: center; gap: 6px; flex: 1; min-width: 0; flex-wrap: wrap; }
  .upload-id { font-family: var(--font-mono); font-size: 13px; font-weight: 500; }
  .upload-size { font-size: 12px; color: var(--muted); }

  .badge {
    display: inline-flex; align-items: center; gap: 3px;
    border-radius: 4px; padding: 1px 6px; font-size: 11px; font-weight: 600;
  }
  .badge--expired { background: color-mix(in srgb, #d9534f 15%, transparent); color: #d9534f; }
  .badge--lock { background: color-mix(in srgb, var(--brand) 12%, transparent); color: var(--brand); }

  .upload-details { display: flex; gap: 12px; flex-wrap: wrap; flex: 1; }
  .upload-detail { font-size: 12px; color: var(--muted); white-space: nowrap; }

  .upload-actions { display: flex; align-items: center; gap: 6px; flex-shrink: 0; }
  .btn-link {
    display: inline-flex; align-items: center; justify-content: center;
    width: 28px; height: 28px;
    background: transparent; border: 1px solid var(--border);
    border-radius: 6px; color: var(--muted);
    cursor: pointer; transition: background 0.1s, color 0.1s;
    text-decoration: none;
  }
  .btn-link:hover { background: var(--surface-3); color: var(--text); }
  .btn-delete {
    display: inline-flex; align-items: center; justify-content: center;
    width: 28px; height: 28px;
    background: transparent; border: 1px solid var(--border);
    border-radius: 6px; color: var(--muted);
    cursor: pointer; transition: background 0.1s, color 0.1s;
  }
  .btn-delete:disabled { opacity: 0.5; cursor: not-allowed; }
  .btn-delete:not(:disabled):hover {
    background: color-mix(in srgb, #d9534f 12%, transparent);
    color: #d9534f;
    border-color: color-mix(in srgb, #d9534f 35%, transparent);
  }

  @media (max-width: 480px) {
    .page { padding: 32px 16px 60px; }
    .card { padding: 16px; }
  }
</style>
