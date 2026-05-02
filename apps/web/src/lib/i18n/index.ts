import { browser } from '$app/environment';
import { addMessages, init } from 'svelte-i18n';
import deMessages from './de.json';
import enMessages from './en.json';

const DEFAULT_LOCALE = 'de';

// Synchronous bundle registration so the first render never hits
// "Cannot format a message without first setting the initial locale".
// The two JSON files are tiny — bundling them inline is cheaper than
// the round-trip cost of a lazy import.
export function initI18n(): void {
  addMessages('de', deMessages);
  addMessages('en', enMessages);

  init({
    fallbackLocale: DEFAULT_LOCALE,
    initialLocale: browser ? (window.navigator.language?.split('-')[0] ?? DEFAULT_LOCALE) : DEFAULT_LOCALE,
  });
}
