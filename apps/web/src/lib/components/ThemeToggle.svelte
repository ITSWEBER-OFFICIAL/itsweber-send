<script lang="ts">
  import { _ } from 'svelte-i18n';
  import { theme } from '$lib/stores/theme.svelte.js';
  import Sun from '$lib/components/icons/Sun.svelte';
  import Moon from '$lib/components/icons/Moon.svelte';
  import Monitor from '$lib/components/icons/Monitor.svelte';

  const options = [
    { value: 'light' as const, label: 'theme.light', Icon: Sun },
    { value: 'system' as const, label: 'theme.system', Icon: Monitor },
    { value: 'dark' as const, label: 'theme.dark', Icon: Moon },
  ];
</script>

<div class="toggle" role="radiogroup" aria-label={$_('theme.aria_label')}>
  {#each options as opt (opt.value)}
    {@const SvelteIcon = opt.Icon}
    <button
      type="button"
      role="radio"
      aria-checked={theme.value === opt.value}
      class:active={theme.value === opt.value}
      onclick={() => theme.set(opt.value)}
    >
      <SvelteIcon size={14} />
      <span>{$_(opt.label)}</span>
    </button>
  {/each}
</div>

<style>
  .toggle {
    display: inline-flex;
    gap: 4px;
    padding: 4px;
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: 9999px;
  }
  button {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 6px 12px;
    border: 0;
    background: transparent;
    color: var(--muted);
    font-family: inherit;
    font-size: 13px;
    line-height: 1;
    cursor: pointer;
    border-radius: 9999px;
    transition: background var(--transition-fast), color var(--transition-fast);
  }
  button:hover {
    color: var(--text);
  }
  button.active {
    background: var(--surface);
    color: var(--text);
    box-shadow: var(--shadow-sm);
  }
</style>
