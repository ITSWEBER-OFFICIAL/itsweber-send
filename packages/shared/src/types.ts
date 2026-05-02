/** Storage backend identifier. */
export type StorageBackend = 'filesystem' | 's3';

/** Theme preference written to the `data-theme` attribute. */
export type ThemeMode = 'light' | 'dark' | 'system';

/** Result of a server-side share lookup. */
export interface ShareLookup {
  found: boolean;
  expired: boolean;
  exhausted: boolean;
  passwordRequired: boolean;
}
