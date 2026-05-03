/**
 * Build-time version constant. Sourced from `apps/web/package.json` via
 * Vite's `define` (see `vite.config.ts`); bumping the package.json
 * version is the only step needed to propagate.
 */

declare const __APP_VERSION__: string;

export const APP_VERSION: string = __APP_VERSION__;
