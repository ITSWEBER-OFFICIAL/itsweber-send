<script lang="ts">
  import { theme } from '$lib/stores/theme.svelte.js';
  import type { ThemeMode } from '@itsweber-send/shared';
  import Palette from '$lib/components/icons/Palette.svelte';
  import Sun from '$lib/components/icons/Sun.svelte';
  import Moon from '$lib/components/icons/Moon.svelte';
  import Monitor from '$lib/components/icons/Monitor.svelte';

  interface ThemeOption {
    value: ThemeMode;
    label: string;
    description: string;
    Icon: typeof Sun;
  }

  const options: ThemeOption[] = [
    {
      value: 'light',
      label: 'Hell',
      description: 'Helle Hintergrundfarben, dunkle Schrift.',
      Icon: Sun,
    },
    {
      value: 'dark',
      label: 'Dunkel',
      description: 'Dunkle Hintergrundfarben, helle Schrift.',
      Icon: Moon,
    },
    {
      value: 'system',
      label: 'System',
      description: 'Folgt automatisch der Systemeinstellung.',
      Icon: Monitor,
    },
  ];
</script>

<div class="page">
  <header class="page-header">
    <Palette size={20} />
    <div>
      <h1>Theme &amp; Darstellung</h1>
      <p class="sub">
        Wähle aus, wie die Oberfläche dargestellt wird. Die Einstellung wird lokal gespeichert.
      </p>
    </div>
  </header>

  <section class="section">
    <div class="card">
      <div class="card-head">
        <h2>Farbschema</h2>
      </div>
      <div class="card-body">
        <div class="theme-grid" role="radiogroup" aria-label="Farbschema wählen">
          {#each options as opt (opt.value)}
            {@const SvelteIcon = opt.Icon}
            <button
              type="button"
              role="radio"
              aria-checked={theme.value === opt.value}
              class="theme-card"
              class:active={theme.value === opt.value}
              onclick={() => theme.set(opt.value)}
            >
              <div class="theme-icon" class:active={theme.value === opt.value}>
                <SvelteIcon size={22} />
              </div>
              <div class="theme-info">
                <span class="theme-label">{opt.label}</span>
                <span class="theme-desc">{opt.description}</span>
              </div>
              {#if theme.value === opt.value}
                <div class="check-mark" aria-hidden="true">
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2.5"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  >
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </div>
              {/if}
            </button>
          {/each}
        </div>
      </div>
    </div>

    <div class="card card-preview">
      <div class="card-head">
        <h2>Vorschau</h2>
      </div>
      <div class="card-body preview-body">
        <div class="preview-surface">
          <div class="preview-bar"></div>
          <div class="preview-line short"></div>
          <div class="preview-line medium"></div>
          <div class="preview-line short"></div>
          <div class="preview-pill"></div>
        </div>
        <p class="preview-note">
          Aktives Farbschema: <strong
            >{options.find((o) => o.value === theme.value)?.label ?? '—'}</strong
          >
        </p>
      </div>
    </div>
  </section>
</div>

<style>
  .page {
    max-width: 640px;
  }

  .page-header {
    display: flex;
    align-items: flex-start;
    gap: 14px;
    margin-bottom: 32px;
    color: var(--brand);
  }
  .page-header h1 {
    margin: 0 0 4px;
    font-size: 22px;
    letter-spacing: -0.02em;
    color: var(--text);
  }
  .page-header .sub {
    margin: 0;
    font-size: 14px;
    color: var(--muted);
    line-height: 1.5;
  }

  .section {
    display: flex;
    flex-direction: column;
    gap: 18px;
  }

  .card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
  }
  .card-head {
    padding: 16px 20px;
    border-bottom: 1px solid var(--border);
  }
  .card-head h2 {
    margin: 0;
    font-size: 13px;
    text-transform: uppercase;
    letter-spacing: 0.07em;
    color: var(--muted);
    font-weight: 600;
  }
  .card-body {
    padding: 20px;
  }

  .theme-grid {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .theme-card {
    position: relative;
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 14px 16px;
    border: 2px solid var(--border);
    border-radius: var(--radius);
    background: var(--surface);
    color: var(--text);
    cursor: pointer;
    font-family: inherit;
    text-align: left;
    transition:
      border-color var(--transition-fast),
      background var(--transition-fast);
  }
  .theme-card:hover:not(.active) {
    border-color: var(--brand-soft);
    background: var(--surface-2);
  }
  .theme-card.active {
    border-color: var(--brand);
    background: var(--brand-soft);
  }

  .theme-icon {
    width: 40px;
    height: 40px;
    border-radius: var(--radius-sm);
    background: var(--surface-2);
    border: 1px solid var(--border);
    display: grid;
    place-items: center;
    color: var(--muted);
    flex-shrink: 0;
    transition:
      color var(--transition-fast),
      background var(--transition-fast);
  }
  .theme-icon.active {
    background: var(--brand);
    border-color: var(--brand);
    color: var(--surface);
  }

  .theme-info {
    display: flex;
    flex-direction: column;
    gap: 3px;
    flex: 1;
  }
  .theme-label {
    font-size: 15px;
    font-weight: 600;
    line-height: 1;
  }
  .theme-desc {
    font-size: 13px;
    color: var(--muted);
  }
  .theme-card.active .theme-desc {
    color: var(--brand-strong);
    opacity: 0.8;
  }

  .check-mark {
    width: 22px;
    height: 22px;
    border-radius: 50%;
    background: var(--brand);
    color: var(--surface);
    display: grid;
    place-items: center;
    flex-shrink: 0;
  }

  /* Preview */
  .card-preview {
    overflow: hidden;
  }
  .preview-body {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }
  .preview-surface {
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .preview-bar {
    height: 8px;
    width: 60%;
    border-radius: 9999px;
    background: var(--brand);
    opacity: 0.7;
  }
  .preview-line {
    height: 6px;
    border-radius: 9999px;
    background: var(--border);
  }
  .preview-line.short {
    width: 40%;
  }
  .preview-line.medium {
    width: 70%;
  }
  .preview-pill {
    margin-top: 4px;
    width: 72px;
    height: 22px;
    border-radius: 9999px;
    background: var(--brand-soft);
    border: 1px solid var(--brand);
  }
  .preview-note {
    margin: 0;
    font-size: 13px;
    color: var(--muted);
  }
  .preview-note strong {
    color: var(--text);
  }
</style>
