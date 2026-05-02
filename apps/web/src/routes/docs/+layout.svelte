<script lang="ts">
  import { page } from '$app/stores';
  import BookOpen from '$lib/components/icons/BookOpen.svelte';
  import Shield from '$lib/components/icons/Shield.svelte';
  import Key from '$lib/components/icons/Key.svelte';
  import Globe from '$lib/components/icons/Globe.svelte';
  import Gauge from '$lib/components/icons/Gauge.svelte';
  import FileText from '$lib/components/icons/FileText.svelte';

  const { children } = $props();

  const nav = [
    { href: '/docs', label: 'Übersicht', Icon: BookOpen },
    { href: '/docs/security', label: 'Sicherheit', Icon: Shield },
    { href: '/docs/api', label: 'API-Referenz', Icon: Key },
    { href: '/docs/install', label: 'Installation', Icon: Globe },
    { href: '/docs/config', label: 'Konfiguration', Icon: Gauge },
  ];

  const pathname = $derived($page.url?.pathname ?? '/docs');

  function isActive(href: string): boolean {
    if (href === '/docs') return pathname === '/docs';
    return pathname.startsWith(href);
  }
</script>

<div class="layout">
  <aside class="sidebar">
    <p class="sidebar-label">Dokumentation</p>
    {#each nav as item}
      {@const Icon = item.Icon}
      <a class="nav-link" class:active={isActive(item.href)} href={item.href}>
        <Icon size={15} />
        <span>{item.label}</span>
      </a>
    {/each}
  </aside>
  <div class="content">
    {@render children()}
  </div>
</div>

<style>
  .layout {
    display: grid;
    grid-template-columns: 220px 1fr;
    max-width: 1100px;
    margin: 0 auto;
    padding: 40px 24px 100px;
    gap: 40px;
    align-items: start;
  }
  .sidebar {
    position: sticky;
    top: 80px;
    padding: 16px 0;
  }
  .sidebar-label {
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: var(--dim);
    font-weight: 700;
    margin: 0 12px 10px;
  }
  .nav-link {
    display: flex;
    align-items: center;
    gap: 9px;
    padding: 8px 12px;
    border-radius: var(--radius-sm);
    text-decoration: none;
    color: var(--muted);
    font-size: 14px;
    transition: color var(--transition-fast), background var(--transition-fast);
  }
  .nav-link:hover {
    background: var(--surface-2);
    color: var(--text);
  }
  .nav-link.active {
    background: var(--brand-soft);
    color: var(--brand-strong);
    font-weight: 500;
  }
  :global([data-theme='dark']) .nav-link.active { color: var(--brand); }
  @media (prefers-color-scheme: dark) {
    :global([data-theme='system']) .nav-link.active { color: var(--brand); }
  }
  @media (max-width: 780px) {
    .layout {
      grid-template-columns: 1fr;
      padding: 24px 16px 80px;
      gap: 0;
    }
    .sidebar {
      position: static;
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
      padding: 0 0 20px;
      border-bottom: 1px solid var(--border);
      margin-bottom: 28px;
    }
    .sidebar-label { display: none; }
    .nav-link { font-size: 13px; padding: 6px 10px; }
  }
</style>
