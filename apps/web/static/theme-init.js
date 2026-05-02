// Apply persisted theme before paint to avoid a flash of wrong theme.
// Runs synchronously from <head> with src="/theme-init.js"; CSP-safe
// because it loads from the same origin (script-src 'self').
try {
  var stored = localStorage.getItem('theme');
  if (stored === 'light' || stored === 'dark' || stored === 'system') {
    document.documentElement.dataset.theme = stored;
  }
} catch (_) {
  // localStorage may be unavailable; system default applies.
}
