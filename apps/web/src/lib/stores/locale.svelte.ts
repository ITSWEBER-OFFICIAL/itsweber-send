import { browser } from '$app/environment';
import { locale as i18nLocale } from 'svelte-i18n';

const STORAGE_KEY = 'lang';
const SUPPORTED = ['de', 'en'] as const;
type Lang = (typeof SUPPORTED)[number];

function isLang(v: unknown): v is Lang {
  return v === 'de' || v === 'en';
}

function readPersisted(): Lang | null {
  if (!browser) return null;
  const v = localStorage.getItem(STORAGE_KEY);
  return isLang(v) ? v : null;
}

class LocaleStore {
  #value = $state<Lang>('de');

  get value(): Lang {
    return this.#value;
  }

  set(lang: Lang): void {
    this.#value = lang;
    i18nLocale.set(lang);
    if (browser) {
      try {
        localStorage.setItem(STORAGE_KEY, lang);
      } catch {
        // localStorage may be denied; ignore.
      }
    }
  }

  toggle(): void {
    this.set(this.#value === 'de' ? 'en' : 'de');
  }

  hydrate(): void {
    const persisted = readPersisted();
    if (persisted) {
      this.#value = persisted;
      i18nLocale.set(persisted);
      return;
    }
    if (browser) {
      const navLang = (window.navigator.language?.split('-')[0] ?? 'de') as string;
      this.#value = isLang(navLang) ? navLang : 'de';
    }
  }
}

export const locale = new LocaleStore();
