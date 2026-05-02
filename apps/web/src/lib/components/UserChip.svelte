<script lang="ts">
  import { _ } from 'svelte-i18n';
  import { goto } from '$app/navigation';
  import { auth } from '$lib/stores/auth.svelte.js';

  let open = $state(false);
  let menuRef: HTMLDivElement | undefined = $state();

  const initials = $derived.by(() => {
    const email = auth.user?.email ?? '';
    const local = email.split('@')[0] ?? '';
    return local.slice(0, 2).toUpperCase() || 'U';
  });

  async function handleLogout() {
    open = false;
    await auth.logout();
    await goto('/');
  }

  function onDocClick(e: MouseEvent) {
    if (!menuRef) return;
    if (!menuRef.contains(e.target as Node)) open = false;
  }

  $effect(() => {
    if (open) {
      document.addEventListener('click', onDocClick);
      return () => document.removeEventListener('click', onDocClick);
    }
  });
</script>

<div class="wrap" bind:this={menuRef}>
  <button
    type="button"
    class="chip"
    onclick={() => (open = !open)}
    aria-haspopup="menu"
    aria-expanded={open}
    aria-label={auth.user?.email ?? 'Konto'}
  >
    <span class="avatar" aria-hidden="true">{initials}</span>
    <span class="email">{auth.user?.email}</span>
  </button>

  {#if open}
    <div class="menu" role="menu">
      <a class="menu-item" href="/account" onclick={() => (open = false)}>{$_('nav.account')}</a>
      {#if auth.user?.role === 'admin'}
        <a class="menu-item" href="/admin" onclick={() => (open = false)}>{$_('nav.admin')}</a>
      {/if}
      <div class="sep" role="separator"></div>
      <button type="button" class="menu-item danger" onclick={handleLogout}>
        {$_('nav.logout')}
      </button>
    </div>
  {/if}
</div>

<style>
  .wrap {
    position: relative;
  }
  .chip {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 4px 12px 4px 4px;
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: 9999px;
    font-size: 13px;
    color: var(--text);
    cursor: pointer;
    font-family: inherit;
    transition:
      border-color var(--transition-fast),
      background var(--transition-fast);
  }
  .chip:hover {
    border-color: var(--border-strong);
  }
  .avatar {
    width: 28px;
    height: 28px;
    border-radius: 50%;
    background: linear-gradient(135deg, var(--brand), var(--brand-strong));
    color: #0a1a26;
    display: grid;
    place-items: center;
    font-weight: 700;
    font-size: 11px;
    letter-spacing: 0.02em;
  }
  .email {
    max-width: 160px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .menu {
    position: absolute;
    top: calc(100% + 8px);
    right: 0;
    min-width: 200px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    box-shadow: var(--shadow-lg);
    padding: 6px;
    z-index: 40;
  }
  .menu-item {
    display: flex;
    width: 100%;
    padding: 8px 12px;
    border-radius: var(--radius-sm);
    background: transparent;
    border: 0;
    color: var(--text);
    font-size: 14px;
    font-family: inherit;
    cursor: pointer;
    text-align: left;
    text-decoration: none;
  }
  .menu-item:hover {
    background: var(--surface-2);
  }
  .menu-item.danger {
    color: var(--danger);
  }
  .sep {
    height: 1px;
    background: var(--border);
    margin: 4px 0;
  }
  @media (max-width: 640px) {
    .email {
      display: none;
    }
  }
</style>
