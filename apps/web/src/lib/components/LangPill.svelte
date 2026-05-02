<script lang="ts">
  import { locale } from '$lib/stores/locale.svelte.js';
</script>

<button
  type="button"
  class="lang-pill"
  onclick={() => locale.toggle()}
  aria-label="Sprache wechseln / Switch language"
  title={locale.value === 'de' ? 'Switch to English' : 'Auf Deutsch umstellen'}
>
  {locale.value.toUpperCase()}
</button>

<style>
  .lang-pill {
    border: 1px solid var(--border);
    background: var(--surface);
    border-radius: 9999px;
    padding: 6px 12px;
    font-size: 13px;
    font-weight: 600;
    letter-spacing: 0.04em;
    color: var(--muted);
    cursor: pointer;
    font-family: inherit;
    line-height: 1;
    transition:
      color var(--transition-fast),
      border-color var(--transition-fast),
      background var(--transition-fast);
  }
  .lang-pill:hover {
    color: var(--text);
    border-color: var(--border-strong);
  }
</style>
