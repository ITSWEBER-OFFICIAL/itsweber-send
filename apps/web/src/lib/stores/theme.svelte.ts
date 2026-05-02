import type { ThemeMode } from '@itsweber-send/shared';

const STORAGE_KEY = 'theme';

function isThemeMode(v: unknown): v is ThemeMode {
  return v === 'light' || v === 'dark' || v === 'system';
}

function applyTheme(mode: ThemeMode): void {
  if (typeof document === 'undefined') return;
  document.documentElement.dataset.theme = mode;
}

function readPersisted(): ThemeMode {
  if (typeof localStorage === 'undefined') return 'system';
  const v = localStorage.getItem(STORAGE_KEY);
  return isThemeMode(v) ? v : 'system';
}

function persist(mode: ThemeMode): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    // localStorage may be denied (private browsing); ignore.
  }
}

class ThemeStore {
  #value = $state<ThemeMode>('system');

  get value(): ThemeMode {
    return this.#value;
  }

  set(mode: ThemeMode): void {
    this.#value = mode;
    applyTheme(mode);
    persist(mode);
  }

  /** Hydrate from localStorage on the client after first paint. */
  hydrate(): void {
    const persisted = readPersisted();
    this.#value = persisted;
    applyTheme(persisted);
  }
}

export const theme = new ThemeStore();
