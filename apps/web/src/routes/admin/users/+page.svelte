<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { auth } from '$lib/stores/auth.svelte.js';
  import User from '$lib/components/icons/User.svelte';
  import Shield from '$lib/components/icons/Shield.svelte';
  import Trash from '$lib/components/icons/Trash.svelte';
  import Check from '$lib/components/icons/Check.svelte';

  interface AdminUser {
    id: string;
    email: string;
    displayName: string | null;
    role: 'admin' | 'user';
    createdAt: string;
    lastLoginAt: string | null;
    quotaBytes: number;
    totpEnabled: boolean;
  }

  interface UsersResponse {
    total: number;
    users: AdminUser[];
  }

  let total = $state(0);
  let users = $state<AdminUser[]>([]);
  let loading = $state(true);
  let loadingMore = $state(false);
  let forbidden = $state(false);
  let offset = $state(0);
  const limit = 50;

  // search / filter
  let search = $state('');
  let roleFilter = $state<'all' | 'admin' | 'user'>('all');

  // per-row edit state
  let editingId = $state<string | null>(null);
  let editRole = $state<'admin' | 'user'>('user');
  let editQuotaGb = $state(0);
  let saving = $state(false);
  let saveError = $state<string | null>(null);

  // delete confirm
  let deletingId = $state<string | null>(null);
  let deleteError = $state<string | null>(null);

  const filtered = $derived.by(() => {
    return users.filter((u) => {
      const matchSearch =
        search === '' ||
        u.email.toLowerCase().includes(search.toLowerCase()) ||
        (u.displayName ?? '').toLowerCase().includes(search.toLowerCase());
      const matchRole = roleFilter === 'all' || u.role === roleFilter;
      return matchSearch && matchRole;
    });
  });

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
    return new Date(iso).toLocaleDateString('de-DE');
  }

  async function load(reset = false) {
    if (reset) {
      offset = 0;
      users = [];
      loading = true;
    } else {
      loadingMore = true;
    }
    try {
      const res = await fetch(`/api/v1/admin/users?limit=${limit}&offset=${offset}`);
      if (res.status === 401) {
        await goto('/login');
        return;
      }
      if (res.status === 403) {
        forbidden = true;
        return;
      }
      if (res.ok) {
        const body = (await res.json()) as UsersResponse;
        total = body.total;
        users = reset ? body.users : [...users, ...body.users];
        offset = users.length;
      }
    } finally {
      loading = false;
      loadingMore = false;
    }
  }

  function startEdit(user: AdminUser) {
    editingId = user.id;
    editRole = user.role;
    editQuotaGb = Math.round(user.quotaBytes / (1024 * 1024 * 1024));
    saveError = null;
  }

  function cancelEdit() {
    editingId = null;
    saveError = null;
  }

  async function saveEdit(user: AdminUser) {
    saving = true;
    saveError = null;
    try {
      const body: Record<string, unknown> = {};
      if (editRole !== user.role) body.role = editRole;
      const newQuota = editQuotaGb * 1024 * 1024 * 1024;
      if (newQuota !== user.quotaBytes) body.quotaBytes = newQuota;

      const res = await fetch(`/api/v1/admin/users/${user.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { message?: string };
        saveError = err.message ?? 'Fehler beim Speichern';
        return;
      }
      const updated = (await res.json()) as AdminUser;
      users = users.map((u) => (u.id === updated.id ? updated : u));
      editingId = null;
    } finally {
      saving = false;
    }
  }

  async function confirmDelete(id: string) {
    deleteError = null;
    const res = await fetch(`/api/v1/admin/users/${id}`, { method: 'DELETE' });
    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { message?: string };
      deleteError = err.message ?? 'Fehler beim Loschen';
      return;
    }
    users = users.filter((u) => u.id !== id);
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
  <div class="crumbs"><a href="/admin">Admin</a> · Nutzer</div>
  <div class="page-header">
    <div>
      <h1 class="page-title">Nutzer</h1>
      <p class="page-sub">{total} registrierte Konten</p>
    </div>
  </div>

  <!-- Filter bar -->
  <div class="filter-bar">
    <input
      class="search-input"
      type="search"
      placeholder="E-Mail oder Name suchen ..."
      bind:value={search}
    />
    <div class="role-tabs" role="group" aria-label="Rolle filtern">
      {#each ['all', 'admin', 'user'] as const as r}
        <button class="role-tab" class:active={roleFilter === r} onclick={() => (roleFilter = r)}>
          {r === 'all' ? 'Alle' : r === 'admin' ? 'Admin' : 'Nutzer'}
        </button>
      {/each}
    </div>
  </div>

  <section class="panel">
    <div class="panel-h">
      <h2>Konten</h2>
      <span class="hint-pill">{filtered.length} angezeigt</span>
    </div>
    <div class="table-body">
      {#if filtered.length === 0}
        <p class="empty">Keine Nutzer gefunden.</p>
      {:else}
        <table>
          <thead>
            <tr>
              <th>Konto</th>
              <th>Rolle</th>
              <th>Erstellt</th>
              <th>Letzter Login</th>
              <th>Quota</th>
              <th>2FA</th>
              <th>Aktionen</th>
            </tr>
          </thead>
          <tbody>
            {#each filtered as user (user.id)}
              <tr>
                <td>
                  <div class="user-cell">
                    <span class="avatar">{(user.email[0] ?? '?').toUpperCase()}</span>
                    <div class="user-stack">
                      <div class="user-email" title={user.email}>{user.email}</div>
                      <div class="user-id" title={user.id}>{user.id.slice(0, 12)}...</div>
                    </div>
                  </div>
                </td>
                <td>
                  {#if user.role === 'admin'}
                    <span class="badge badge-admin">Admin</span>
                  {:else}
                    <span class="badge badge-user">Nutzer</span>
                  {/if}
                </td>
                <td class="muted">{new Date(user.createdAt).toLocaleDateString('de-DE')}</td>
                <td class="muted">{relativeDate(user.lastLoginAt)}</td>
                <td class="mono">{formatBytes(user.quotaBytes)}</td>
                <td>
                  {#if user.totpEnabled}
                    <span class="totp-on" title="TOTP aktiv">
                      <Shield size={14} />
                    </span>
                  {:else}
                    <span class="totp-off" title="Kein TOTP">-</span>
                  {/if}
                </td>
                <td>
                  <div class="row-actions">
                    {#if editingId !== user.id}
                      <button class="btn-ghost" onclick={() => startEdit(user)}>
                        Bearbeiten
                      </button>
                      <button
                        class="btn-danger-ghost"
                        onclick={() => {
                          deletingId = user.id;
                          deleteError = null;
                        }}
                        title="Nutzer loschen"
                      >
                        <Trash size={14} />
                      </button>
                    {:else}
                      <button class="btn-ghost muted-btn" onclick={cancelEdit}>Abbrechen</button>
                    {/if}
                  </div>
                </td>
              </tr>

              <!-- Inline edit row -->
              {#if editingId === user.id}
                <tr class="edit-row">
                  <td colspan="7">
                    <div class="edit-form">
                      <div class="edit-field">
                        <label for="role-{user.id}">Rolle</label>
                        <select id="role-{user.id}" bind:value={editRole}>
                          <option value="user">Nutzer</option>
                          <option value="admin">Admin</option>
                        </select>
                      </div>
                      <div class="edit-field">
                        <label for="quota-{user.id}">Quota (GB)</label>
                        <input
                          id="quota-{user.id}"
                          type="number"
                          min="0"
                          step="1"
                          bind:value={editQuotaGb}
                        />
                      </div>
                      <button class="btn-primary" onclick={() => saveEdit(user)} disabled={saving}>
                        {#if saving}
                          <span class="spinner-sm" aria-hidden="true"></span> Speichern ...
                        {:else}
                          <Check size={14} /> Speichern
                        {/if}
                      </button>
                      {#if saveError}
                        <span class="inline-error">{saveError}</span>
                      {/if}
                    </div>
                  </td>
                </tr>
              {/if}

              <!-- Delete confirm row -->
              {#if deletingId === user.id}
                <tr class="confirm-row">
                  <td colspan="7">
                    <div class="confirm-bar">
                      <span
                        >Nutzer <strong>{user.email}</strong> wirklich loschen? Dies kann nicht ruckgangig
                        gemacht werden.</span
                      >
                      <div class="confirm-actions">
                        <button class="btn-ghost" onclick={() => (deletingId = null)}
                          >Abbrechen</button
                        >
                        <button class="btn-danger" onclick={() => confirmDelete(user.id)}>
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

    {#if users.length < total}
      <div class="load-more">
        <button class="btn-ghost" onclick={() => load(false)} disabled={loadingMore}>
          {#if loadingMore}Laden ...{:else}Mehr laden ({total - users.length} weitere){/if}
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
  .spinner-sm {
    display: inline-block;
    width: 14px;
    height: 14px;
    border: 2px solid var(--border);
    border-top-color: var(--brand);
    border-radius: 50%;
    animation: spin 0.7s linear infinite;
    vertical-align: middle;
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

  .filter-bar {
    display: flex;
    gap: 12px;
    align-items: center;
    margin-bottom: 16px;
    flex-wrap: wrap;
  }
  .search-input {
    flex: 1;
    min-width: 200px;
    height: 36px;
    padding: 0 12px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    color: var(--text);
    font-size: 14px;
    transition: border-color var(--transition-fast);
  }
  .search-input:focus {
    outline: none;
    border-color: var(--brand);
  }
  .role-tabs {
    display: flex;
    gap: 4px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    padding: 3px;
  }
  .role-tab {
    padding: 4px 14px;
    font-size: 13px;
    border: none;
    border-radius: calc(var(--radius-sm) - 2px);
    background: transparent;
    color: var(--muted);
    cursor: pointer;
    transition:
      background var(--transition-fast),
      color var(--transition-fast);
  }
  .role-tab.active {
    background: var(--brand);
    color: var(--surface);
    font-weight: 600;
  }
  .role-tab:not(.active):hover {
    background: var(--surface-2);
    color: var(--text);
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
    color: var(--surface);
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

  .badge {
    display: inline-block;
    padding: 2px 8px;
    border-radius: 99px;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.04em;
  }
  .badge-admin {
    background: var(--brand-soft);
    color: var(--brand-strong);
  }
  .badge-user {
    background: var(--surface-2);
    color: var(--muted);
  }

  .totp-on {
    color: var(--brand);
    display: inline-flex;
    align-items: center;
  }
  .totp-off {
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

  .row-actions {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .edit-row td,
  .confirm-row td {
    background: var(--surface-2);
    padding: 14px 22px;
    border-bottom: 1px solid var(--border);
  }

  .edit-form {
    display: flex;
    align-items: center;
    gap: 16px;
    flex-wrap: wrap;
  }
  .edit-field {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .edit-field label {
    font-size: 11px;
    color: var(--muted);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  .edit-field select,
  .edit-field input[type='number'] {
    height: 34px;
    padding: 0 10px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    color: var(--text);
    font-size: 14px;
    transition: border-color var(--transition-fast);
  }
  .edit-field select:focus,
  .edit-field input[type='number']:focus {
    outline: none;
    border-color: var(--brand);
  }
  .edit-field input[type='number'] {
    width: 90px;
  }

  .confirm-bar {
    display: flex;
    align-items: center;
    gap: 16px;
    flex-wrap: wrap;
    font-size: 14px;
  }
  .confirm-bar strong {
    color: var(--text);
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

  /* Buttons */
  .btn-primary {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 6px 14px;
    background: var(--brand);
    color: var(--surface);
    border: none;
    border-radius: var(--radius-sm);
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    transition: opacity var(--transition-fast);
  }
  .btn-primary:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
  .btn-primary:not(:disabled):hover {
    opacity: 0.88;
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
  .muted-btn {
    color: var(--muted);
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
