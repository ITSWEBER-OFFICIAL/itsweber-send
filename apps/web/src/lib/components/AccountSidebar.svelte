<script lang="ts">
  import { page } from '$app/stores';
  import { _ } from 'svelte-i18n';
  import LayoutDashboard from '$lib/components/icons/LayoutDashboard.svelte';
  import Files from '$lib/components/icons/Files.svelte';
  import Key from '$lib/components/icons/Key.svelte';
  import Bell from '$lib/components/icons/Bell.svelte';
  import User from '$lib/components/icons/User.svelte';
  import Shield from '$lib/components/icons/Shield.svelte';
  import Globe from '$lib/components/icons/Globe.svelte';
  import Palette from '$lib/components/icons/Palette.svelte';
  import Gauge from '$lib/components/icons/Gauge.svelte';
  import FileText from '$lib/components/icons/FileText.svelte';
  import { auth } from '$lib/stores/auth.svelte.js';

  interface Props {
    variant?: 'account' | 'admin';
  }
  let { variant = 'account' }: Props = $props();

  type Item = {
    href: string;
    labelKey: string;
    Icon: typeof LayoutDashboard;
  };

  const accountGroups: { titleKey: string; items: Item[] }[] = [
    {
      titleKey: 'sidebar.group.account',
      items: [
        { href: '/account', labelKey: 'sidebar.nav.overview', Icon: LayoutDashboard },
        { href: '/account/uploads', labelKey: 'sidebar.nav.my_uploads', Icon: Files },
        { href: '/account/tokens', labelKey: 'sidebar.nav.api_tokens', Icon: Key },
        { href: '/account/notifications', labelKey: 'sidebar.nav.notifications', Icon: Bell },
      ],
    },
    {
      titleKey: 'sidebar.group.settings',
      items: [
        { href: '/account/profile', labelKey: 'sidebar.nav.profile', Icon: User },
        { href: '/account/security', labelKey: 'sidebar.nav.security', Icon: Shield },
        { href: '/account/locale', labelKey: 'sidebar.nav.locale', Icon: Globe },
        { href: '/account/theme', labelKey: 'sidebar.nav.theme', Icon: Palette },
      ],
    },
    {
      titleKey: 'sidebar.group.plan',
      items: [
        { href: '/account/quota', labelKey: 'sidebar.nav.quota', Icon: Gauge },
        { href: '/account/audit', labelKey: 'sidebar.nav.audit', Icon: FileText },
      ],
    },
  ];

  const adminGroups: { titleKey: string; items: Item[] }[] = [
    {
      titleKey: 'sidebar.group.admin',
      items: [
        { href: '/admin', labelKey: 'sidebar.nav.overview', Icon: LayoutDashboard },
        { href: '/admin/users', labelKey: 'sidebar.nav.users', Icon: User },
        { href: '/admin/shares', labelKey: 'sidebar.nav.shares', Icon: Files },
        { href: '/admin/audit', labelKey: 'sidebar.nav.audit', Icon: FileText },
      ],
    },
    {
      titleKey: 'sidebar.group.system',
      items: [
        { href: '/admin/health', labelKey: 'sidebar.nav.health', Icon: Gauge },
        { href: '/admin/settings', labelKey: 'sidebar.nav.admin_settings', Icon: Shield },
      ],
    },
  ];

  const groups = $derived(variant === 'admin' ? adminGroups : accountGroups);
  const pathname = $derived($page.url?.pathname ?? '/account');

  function isActive(href: string): boolean {
    if (href === '/account' || href === '/admin') return pathname === href;
    return pathname.startsWith(href);
  }
</script>

<aside class="side">
  {#if auth.user}
    <div class="me">
      <span class="avatar">{(auth.user.email[0] ?? 'U').toUpperCase()}</span>
      <div class="me-stack">
        <div class="me-name">{auth.user.email.split('@')[0]}</div>
        <div class="me-role">
          {auth.user.role === 'admin' ? $_('sidebar.role_admin') : $_('sidebar.role_user')}
        </div>
      </div>
    </div>
  {/if}
  {#each groups as group}
    <div class="group">
      <h3>{$_(group.titleKey)}</h3>
      {#each group.items as item}
        {@const SvelteIcon = item.Icon}
        <a class="link" class:active={isActive(item.href)} href={item.href}>
          <SvelteIcon size={16} />
          <span>{$_(item.labelKey)}</span>
        </a>
      {/each}
    </div>
  {/each}
</aside>

<style>
  .side {
    padding: 28px 14px;
    border-right: 1px solid var(--border);
    min-height: 100%;
  }
  .me {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 12px;
    margin-bottom: 18px;
    border-radius: var(--radius);
    background: var(--surface-2);
    border: 1px solid var(--border);
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
  }
  .me-stack {
    min-width: 0;
  }
  .me-name {
    font-size: 13px;
    font-weight: 600;
    color: var(--text);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 160px;
  }
  .me-role {
    font-size: 11px;
    color: var(--dim);
  }
  .group {
    margin-bottom: 22px;
  }
  h3 {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: var(--dim);
    margin: 0 12px 8px;
    font-weight: 600;
  }
  .link {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 9px 12px;
    border-radius: var(--radius-sm);
    text-decoration: none;
    color: var(--muted);
    font-size: 14px;
    transition:
      color var(--transition-fast),
      background var(--transition-fast);
  }
  .link:hover {
    background: var(--surface-2);
    color: var(--text);
  }
  .link.active {
    background: var(--brand-soft);
    color: var(--brand-strong);
    font-weight: 500;
  }
  :global([data-theme='dark']) .link.active {
    color: var(--brand);
  }
  @media (prefers-color-scheme: dark) {
    :global([data-theme='system']) .link.active {
      color: var(--brand);
    }
  }

  @media (max-width: 880px) {
    .side {
      padding: 14px 12px;
      border-right: 0;
      border-bottom: 1px solid var(--border);
      min-height: 0;
      display: flex;
      gap: 14px;
      align-items: flex-start;
      overflow-x: auto;
      scrollbar-width: thin;
    }
    .me {
      margin-bottom: 0;
      flex-shrink: 0;
    }
    .group {
      margin-bottom: 0;
      display: flex;
      align-items: center;
      gap: 4px;
      flex-shrink: 0;
    }
    h3 {
      display: none;
    }
    .link {
      padding: 7px 10px;
      white-space: nowrap;
      font-size: 13px;
    }
    .link span {
      display: none;
    }
  }
</style>
