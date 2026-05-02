<script lang="ts">
  import '../app.css';
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { _ } from 'svelte-i18n';
  import { initI18n } from '$lib/i18n/index.js';
  import { theme } from '$lib/stores/theme.svelte.js';
  import { auth } from '$lib/stores/auth.svelte.js';
  import BrandMark from '$lib/components/BrandMark.svelte';
  import ThemeToggle from '$lib/components/ThemeToggle.svelte';

  interface Props {
    children?: import('svelte').Snippet;
  }
  let { children }: Props = $props();

  initI18n();

  onMount(() => {
    theme.hydrate();
    void auth.load();
  });

  async function handleLogout() {
    await auth.logout();
    await goto('/');
  }
</script>

<header class="appbar">
  <a class="brand" href="/">
    <BrandMark size={28} />
    <span class="brand-text">ITSWEBER<span class="accent"> · Send</span></span>
  </a>
  <nav class="nav-right">
    {#if auth.loaded}
      {#if auth.user}
        {#if auth.user.role === 'admin'}
          <a class="nav-link" href="/admin">{$_('nav.admin')}</a>
        {/if}
        <a class="nav-link" href="/account">{$_('nav.account')}</a>
        <button class="nav-btn" onclick={handleLogout}>{$_('nav.logout')}</button>
      {:else}
        <a class="nav-link" href="/login">{$_('nav.login')}</a>
        <a class="nav-link nav-link--accent" href="/register">{$_('nav.register')}</a>
      {/if}
    {/if}
    <ThemeToggle />
  </nav>
</header>

{@render children?.()}

<style>
  .appbar {
    position: sticky;
    top: 0;
    z-index: 30;
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 14px 28px;
    background: color-mix(in srgb, var(--surface) 85%, transparent);
    backdrop-filter: blur(14px);
    border-bottom: 1px solid var(--border);
  }
  .brand {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    color: var(--text);
    text-decoration: none;
    font-weight: 700;
    letter-spacing: -0.01em;
  }
  .accent { color: var(--brand); }

  .nav-right {
    display: flex;
    align-items: center;
    gap: 4px;
  }
  .nav-link {
    padding: 6px 10px;
    font-size: 14px;
    color: var(--muted);
    text-decoration: none;
    border-radius: 7px;
    transition: color 0.15s, background 0.15s;
  }
  .nav-link:hover { color: var(--text); background: var(--surface-2); }
  .nav-link--accent { color: var(--brand); }
  .nav-link--accent:hover { color: var(--brand); opacity: 0.8; }
  .nav-btn {
    padding: 6px 10px;
    font-size: 14px;
    color: var(--muted);
    background: transparent;
    border: none;
    border-radius: 7px;
    cursor: pointer;
    transition: color 0.15s, background 0.15s;
  }
  .nav-btn:hover { color: var(--text); background: var(--surface-2); }

  @media (max-width: 480px) {
    .appbar { padding: 12px 16px; }
    .nav-link, .nav-btn { padding: 5px 7px; font-size: 13px; }
  }
</style>
