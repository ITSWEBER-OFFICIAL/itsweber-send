<script lang="ts">
  import '../app.css';
  import { onMount } from 'svelte';
  import { _ } from 'svelte-i18n';
  import { page } from '$app/stores';
  import { initI18n } from '$lib/i18n/index.js';
  import { theme } from '$lib/stores/theme.svelte.js';
  import { locale } from '$lib/stores/locale.svelte.js';
  import { auth } from '$lib/stores/auth.svelte.js';
  import BrandMark from '$lib/components/BrandMark.svelte';
  import ThemeToggle from '$lib/components/ThemeToggle.svelte';
  import LangPill from '$lib/components/LangPill.svelte';
  import UserChip from '$lib/components/UserChip.svelte';

  interface Props {
    children?: import('svelte').Snippet;
  }
  let { children }: Props = $props();

  initI18n();

  onMount(() => {
    theme.hydrate();
    locale.hydrate();
    void auth.load();
  });

  const navItems = [
    { href: '/', key: 'nav.send', match: (p: string) => p === '/' },
    { href: '/r', key: 'nav.receive', match: (p: string) => p.startsWith('/r') },
    { href: '/account', key: 'nav.account', match: (p: string) => p.startsWith('/account') },
    { href: '/docs', key: 'nav.docs', match: (p: string) => p.startsWith('/docs') },
  ];

  const pathname = $derived($page.url?.pathname ?? '/');
</script>

<header class="appbar">
  <a class="brand" href="/" aria-label="ITSWEBER Send">
    <span class="brand-mark"><BrandMark size={28} /></span>
    <span class="brand-text">ITSWEBER<span class="accent"> · Send</span></span>
  </a>

  <nav class="nav" aria-label="Hauptnavigation">
    {#each navItems as item (item.href)}
      <a
        href={item.href}
        class:active={item.match(pathname)}
        aria-current={item.match(pathname) ? 'page' : undefined}
      >
        {$_(item.key)}
      </a>
    {/each}
  </nav>

  <div class="right-tools">
    <LangPill />
    <ThemeToggle />
    {#if auth.loaded}
      {#if auth.user}
        <UserChip />
      {:else}
        <a class="auth-link" href="/login">{$_('nav.login')}</a>
        <a class="auth-link auth-link--accent" href="/register">{$_('nav.register')}</a>
      {/if}
    {/if}
  </div>
</header>

{@render children?.()}

<style>
  .appbar {
    position: sticky;
    top: 0;
    z-index: 30;
    display: grid;
    grid-template-columns: auto 1fr auto;
    align-items: center;
    gap: 16px;
    padding: 12px 28px;
    background: color-mix(in srgb, var(--surface) 85%, transparent);
    backdrop-filter: blur(14px) saturate(140%);
    border-bottom: 1px solid var(--border);
  }
  .brand {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    color: var(--text);
    text-decoration: none;
    font-weight: 700;
    font-size: 16px;
    letter-spacing: -0.01em;
  }
  .brand-mark {
    color: var(--brand);
    display: inline-flex;
  }
  .accent {
    color: var(--brand);
  }

  .nav {
    display: flex;
    gap: 4px;
    justify-content: center;
    overflow-x: auto;
    scrollbar-width: none;
  }
  .nav::-webkit-scrollbar {
    display: none;
  }
  .nav a {
    color: var(--muted);
    text-decoration: none;
    padding: 6px 14px;
    border-radius: 9999px;
    font-size: 14px;
    white-space: nowrap;
    transition:
      color var(--transition-fast),
      background var(--transition-fast);
  }
  .nav a:hover {
    color: var(--text);
  }
  .nav a.active {
    background: var(--surface-2);
    color: var(--text);
  }

  .right-tools {
    display: flex;
    align-items: center;
    gap: 10px;
    justify-self: end;
  }
  .auth-link {
    padding: 6px 12px;
    font-size: 14px;
    color: var(--muted);
    text-decoration: none;
    border-radius: 9999px;
    transition:
      color var(--transition-fast),
      background var(--transition-fast);
  }
  .auth-link:hover {
    color: var(--text);
    background: var(--surface-2);
  }
  .auth-link--accent {
    color: var(--brand);
  }
  .auth-link--accent:hover {
    color: var(--brand);
    background: var(--brand-soft);
  }

  @media (max-width: 880px) {
    .appbar {
      grid-template-columns: auto auto;
      grid-template-rows: auto auto;
      padding: 10px 16px;
    }
    .brand {
      grid-row: 1;
      grid-column: 1;
    }
    .right-tools {
      grid-row: 1;
      grid-column: 2;
    }
    .nav {
      grid-row: 2;
      grid-column: 1 / -1;
      justify-content: flex-start;
      padding-top: 6px;
    }
  }
</style>
