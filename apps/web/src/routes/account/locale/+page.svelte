<script lang="ts">
  import { onMount } from 'svelte';
  import { _ } from 'svelte-i18n';
  import { locale } from '$lib/stores/locale.svelte.js';
  import Globe from '$lib/components/icons/Globe.svelte';

  const TZ_KEY = 'tz';

  const timezones = [
    { value: 'Europe/Berlin', label: 'Europa/Berlin (DE)' },
    { value: 'Europe/Vienna', label: 'Europa/Wien (AT)' },
    { value: 'Europe/Zurich', label: 'Europa/Zürich (CH)' },
    { value: 'Europe/London', label: 'Europa/London (GB)' },
    { value: 'UTC', label: 'UTC' },
  ];

  let selectedTz = $state('Europe/Berlin');

  onMount(() => {
    const stored = localStorage.getItem(TZ_KEY);
    if (stored && timezones.some((t) => t.value === stored)) {
      selectedTz = stored;
    } else {
      // Detect from browser
      const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (timezones.some((t) => t.value === detected)) {
        selectedTz = detected;
      }
    }
  });

  function setLang(lang: 'de' | 'en') {
    locale.set(lang);
  }

  function setTz(tz: string) {
    selectedTz = tz;
    try {
      localStorage.setItem(TZ_KEY, tz);
    } catch {
      // ignore
    }
  }

  const currentLangLabel = $derived(locale.value === 'de' ? 'Deutsch' : 'English');
</script>

<div class="page">
  <header class="page-header">
    <Globe size={20} />
    <div>
      <h1>{$_('account.locale.title')}</h1>
      <p class="sub">
        {$_('account.locale.sub')}
      </p>
    </div>
  </header>

  <section class="section">
    <div class="card">
      <div class="card-head">
        <h2>{$_('account.locale.lang_heading')}</h2>
        <span class="badge-current">{currentLangLabel}</span>
      </div>
      <div class="card-body">
        <p class="hint">
          {$_('account.locale.lang_hint')}
        </p>
        <div class="lang-group" role="radiogroup" aria-label={$_('account.locale.lang_aria')}>
          <button
            type="button"
            role="radio"
            aria-checked={locale.value === 'de'}
            class="lang-btn"
            class:active={locale.value === 'de'}
            onclick={() => setLang('de')}
          >
            <span class="lang-code">DE</span>
            <span class="lang-name">Deutsch</span>
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={locale.value === 'en'}
            class="lang-btn"
            class:active={locale.value === 'en'}
            onclick={() => setLang('en')}
          >
            <span class="lang-code">EN</span>
            <span class="lang-name">English</span>
          </button>
        </div>
      </div>
    </div>

    <div class="card">
      <div class="card-head">
        <h2>{$_('account.locale.tz_heading')}</h2>
      </div>
      <div class="card-body">
        <p class="hint">
          {$_('account.locale.tz_hint')}
        </p>
        <label for="tz-select" class="field-label">{$_('account.locale.tz_label')}</label>
        <select
          id="tz-select"
          class="select"
          value={selectedTz}
          onchange={(e) => setTz((e.currentTarget as HTMLSelectElement).value)}
        >
          {#each timezones as tz (tz.value)}
            <option value={tz.value}>{tz.label}</option>
          {/each}
        </select>
        <p class="tz-note">
          {$_('account.locale.tz_current')} <code class="mono">{selectedTz}</code>
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
    display: flex;
    justify-content: space-between;
    align-items: center;
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
  .badge-current {
    font-size: 11px;
    font-weight: 600;
    padding: 2px 8px;
    border-radius: 9999px;
    background: var(--brand-soft);
    color: var(--brand-strong);
  }
  .card-body {
    padding: 20px;
  }

  .hint {
    margin: 0 0 16px;
    font-size: 14px;
    color: var(--muted);
    line-height: 1.5;
  }

  .lang-group {
    display: flex;
    gap: 10px;
  }
  .lang-btn {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    padding: 16px;
    border: 2px solid var(--border);
    border-radius: var(--radius);
    background: var(--surface);
    color: var(--muted);
    cursor: pointer;
    font-family: inherit;
    transition:
      border-color var(--transition-fast),
      color var(--transition-fast),
      background var(--transition-fast);
  }
  .lang-btn:hover:not(.active) {
    border-color: var(--brand-soft);
    color: var(--text);
  }
  .lang-btn.active {
    border-color: var(--brand);
    background: var(--brand-soft);
    color: var(--brand-strong);
  }
  .lang-code {
    font-size: 18px;
    font-weight: 700;
    letter-spacing: 0.04em;
    font-family: var(--font-mono);
  }
  .lang-name {
    font-size: 13px;
    font-weight: 500;
  }

  .field-label {
    display: block;
    font-size: 13px;
    font-weight: 500;
    color: var(--muted);
    margin-bottom: 8px;
  }
  .select {
    width: 100%;
    max-width: 340px;
    padding: 9px 12px;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--surface-2);
    color: var(--text);
    font-family: inherit;
    font-size: 14px;
    appearance: auto;
    cursor: pointer;
    transition: border-color var(--transition-fast);
  }
  .select:focus {
    outline: none;
    border-color: var(--brand);
  }
  .tz-note {
    margin: 12px 0 0;
    font-size: 13px;
    color: var(--dim);
  }
  .mono {
    font-family: var(--font-mono);
    font-size: 12px;
    padding: 1px 5px;
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    color: var(--text);
  }
</style>
