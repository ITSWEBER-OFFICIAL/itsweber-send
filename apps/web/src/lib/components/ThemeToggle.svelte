<script lang="ts">
  import { _ } from 'svelte-i18n';
  import { theme } from '$lib/stores/theme.svelte.js';
  import Sun from '$lib/components/icons/Sun.svelte';
  import Moon from '$lib/components/icons/Moon.svelte';
  import Monitor from '$lib/components/icons/Monitor.svelte';

  const options = [
    { value: 'light' as const, labelKey: 'theme.light', Icon: Sun },
    { value: 'system' as const, labelKey: 'theme.system', Icon: Monitor },
    { value: 'dark' as const, labelKey: 'theme.dark', Icon: Moon },
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
      title={$_(opt.labelKey)}
      onclick={() => theme.set(opt.value)}
    >
      <SvelteIcon size={16} />
      <span class="sr-only">{$_(opt.labelKey)}</span>
    </button>
  {/each}
</div>

<style>
  .toggle {
    display: inline-flex;
    gap: 2px;
    padding: 4px;
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: 9999px;
  }
  button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 30px;
    height: 30px;
    border: 0;
    background: transparent;
    color: var(--muted);
    font-family: inherit;
    cursor: pointer;
    border-radius: 9999px;
    transition:
      background var(--transition-fast),
      color var(--transition-fast);
  }
  button:hover {
    color: var(--text);
  }
  button.active {
    background: var(--surface);
    color: var(--text);
    box-shadow: var(--shadow-sm);
  }
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }
</style>
