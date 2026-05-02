import { browser } from '$app/environment';
import { init, register } from 'svelte-i18n';

const DEFAULT_LOCALE = 'de';

export function initI18n(): void {
  register('de', () => import('./de.json'));
  register('en', () => import('./en.json'));

  init({
    fallbackLocale: DEFAULT_LOCALE,
    initialLocale: browser ? (window.navigator.language?.split('-')[0] ?? DEFAULT_LOCALE) : DEFAULT_LOCALE,
  });
}
