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
  import { APP_VERSION } from '$lib/version.js';

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

<footer class="app-footer" aria-label="Build info">
  <span class="app-footer-version" title="Build version">v{APP_VERSION}</span>
</footer>

<style>
  .app-footer {
    /* Lightweight build-info strip — sits at the document end so no page
       has to opt in. Uses a fixed corner instead of a full-width bar so it
       never crowds the actual page footer / footnote. */
    position: fixed;
    right: max(12px, env(safe-area-inset-right, 0px));
    bottom: max(12px, env(safe-area-inset-bottom, 0px));
    z-index: 20;
    pointer-events: none;
  }
  .app-footer-version {
    pointer-events: auto;
    font-family: var(--font-mono, ui-monospace, monospace);
    font-size: 11px;
    color: var(--muted, var(--dim));
    background: color-mix(in srgb, var(--surface) 75%, transparent);
    padding: 3px 8px;
    border-radius: 9999px;
    border: 1px solid var(--border);
    user-select: text;
  }

  .appbar {
    position: sticky;
    top: 0;
    z-index: 30;
    display: grid;
    grid-template-columns: auto 1fr auto;
    align-items: center;
    gap: 16px;
    /* viewport-fit=cover (set in app.html) lets the page render under the
       iOS notch / Android display cutout. Pad with the safe-area inset so
       the brand and nav never disappear behind the camera housing. */
    padding: max(12px, env(safe-area-inset-top, 0px)) max(28px, env(safe-area-inset-right, 0px))
      12px max(28px, env(safe-area-inset-left, 0px));
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
      padding: max(10px, env(safe-area-inset-top, 0px)) max(16px, env(safe-area-inset-right, 0px))
        10px max(16px, env(safe-area-inset-left, 0px));
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

  /* Phone-sized viewports: drop the wordmark to give the right-side tools
     enough room for "Anmelden / Registrieren" without the brand text
     wrapping. The brand mark stays visible so the home affordance is
     preserved. */
  @media (max-width: 480px) {
    .appbar {
      gap: 8px;
      padding: max(8px, env(safe-area-inset-top, 0px)) max(12px, env(safe-area-inset-right, 0px))
        8px max(12px, env(safe-area-inset-left, 0px));
    }
    .brand-text {
      display: none;
    }
    .right-tools {
      gap: 6px;
    }
    .auth-link {
      padding: 5px 9px;
      font-size: 13px;
    }
    .nav a {
      padding: 5px 11px;
      font-size: 13px;
    }
  }
</style>
