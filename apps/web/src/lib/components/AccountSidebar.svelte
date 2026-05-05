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
  import Menu from '$lib/components/icons/Menu.svelte';
  import X from '$lib/components/icons/X.svelte';
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

  // Drawer state — only used at <=880px (the mobile breakpoint where the
  // sidebar collapses to a hamburger trigger). Closed by default; opens
  // when the trigger is tapped, closes on link tap, on overlay tap, on
  // Escape, or when the viewport widens past the breakpoint.
  let drawerOpen = $state(false);

  // Friendly label for the trigger button — shows the current page title
  // so the user knows where they are even with the drawer collapsed.
  const currentLabelKey = $derived.by(() => {
    for (const group of groups) {
      for (const item of group.items) {
        if (isActive(item.href)) return item.labelKey;
      }
    }
    return groups[0]?.items[0]?.labelKey ?? 'sidebar.nav.overview';
  });

  function handleKey(e: KeyboardEvent) {
    if (e.key === 'Escape' && drawerOpen) drawerOpen = false;
  }
</script>

<svelte:window on:keydown={handleKey} />

<!-- Mobile trigger: visible only at <=880px via CSS. Tapping toggles the
     drawer, which slides in from the left and shows the full grouped
     navigation with text labels. -->
<button
  type="button"
  class="trigger"
  aria-label={$_('sidebar.menu_open')}
  aria-expanded={drawerOpen}
  aria-controls="account-drawer"
  onclick={() => (drawerOpen = !drawerOpen)}
>
  <Menu size={18} />
  <span class="trigger-label">{$_(currentLabelKey)}</span>
</button>

{#if drawerOpen}
  <button
    type="button"
    class="overlay"
    aria-label={$_('sidebar.menu_close')}
    onclick={() => (drawerOpen = false)}
  ></button>
{/if}

<aside class="side" class:open={drawerOpen} id="account-drawer">
  <div class="drawer-head">
    <button
      type="button"
      class="close"
      aria-label={$_('sidebar.menu_close')}
      onclick={() => (drawerOpen = false)}
    >
      <X size={18} />
    </button>
  </div>
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
        <a
          class="link"
          class:active={isActive(item.href)}
          href={item.href}
          onclick={() => (drawerOpen = false)}
        >
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

  /* The trigger button + overlay + close button are only used at the
     mobile breakpoint. Hidden on desktop so the sidebar renders as a
     classic vertical column. */
  .trigger,
  .overlay,
  .drawer-head {
    display: none;
  }

  @media (max-width: 880px) {
    /* Replace the horizontally-scrolling icon strip with a tap-to-open
       drawer. The trigger sits inline at the top of the content area
       and shows the current section name so the user always knows
       which page they are on. */
    .trigger {
      display: inline-flex;
      align-items: center;
      gap: 10px;
      margin: 14px 16px 0;
      padding: 10px 14px;
      border-radius: var(--radius);
      border: 1px solid var(--border);
      background: var(--surface);
      color: var(--text);
      font: inherit;
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      min-height: 44px;
      transition:
        color var(--transition-fast),
        border-color var(--transition-fast),
        background var(--transition-fast);
    }
    .trigger:hover {
      border-color: var(--border-strong);
    }
    .trigger-label {
      color: var(--muted);
    }

    .overlay {
      position: fixed;
      inset: 0;
      z-index: 90;
      background: color-mix(in srgb, var(--bg) 70%, transparent);
      backdrop-filter: blur(2px);
      border: 0;
      padding: 0;
      cursor: pointer;
    }

    .side {
      position: fixed;
      top: 0;
      left: 0;
      bottom: 0;
      width: min(86vw, 320px);
      z-index: 100;
      background: var(--surface);
      border-right: 1px solid var(--border);
      padding: 18px 14px max(20px, env(safe-area-inset-bottom, 0px));
      transform: translateX(-100%);
      transition: transform 220ms ease;
      overflow-y: auto;
      box-shadow: var(--shadow-lg);
    }
    .side.open {
      transform: translateX(0);
    }

    .drawer-head {
      display: flex;
      justify-content: flex-end;
      margin-bottom: 8px;
    }
    .close {
      width: 36px;
      height: 36px;
      display: grid;
      place-items: center;
      background: transparent;
      border: 1px solid var(--border);
      border-radius: var(--radius-sm);
      color: var(--muted);
      cursor: pointer;
      transition:
        color var(--transition-fast),
        border-color var(--transition-fast);
    }
    .close:hover {
      color: var(--text);
      border-color: var(--border-strong);
    }

    /* Inside the drawer the layout reverts to the desktop vertical
       stack — full text labels, group headings, generous tap targets. */
    .me {
      margin-bottom: 14px;
    }
    .group {
      margin-bottom: 18px;
    }
    h3 {
      display: block;
    }
    .link {
      padding: 10px 12px;
      font-size: 14px;
      min-height: 44px;
    }
    .link span {
      display: inline;
    }
  }
</style>
