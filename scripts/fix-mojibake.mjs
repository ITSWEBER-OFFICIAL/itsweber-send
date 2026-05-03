#!/usr/bin/env node
/**
 * One-shot fix for the doubly-encoded UTF-8 in apps/web/src/lib/i18n/*.json.
 *
 * Some entries in those files were saved by an editor that took already-
 * UTF-8 bytes and re-encoded them as if they were Latin-1, producing
 * sequences like `Ã¼` for what should have been `ü`. Replaces the known
 * mojibake patterns with the intended characters; validates JSON
 * round-trip; writes back as UTF-8.
 *
 * Patterns are written with `\uXXXX` escapes so the script source itself
 * is robust against editor reflows.
 */

import { readFileSync, writeFileSync } from 'node:fs';

// Two-byte umlaut mojibake (most frequent: every German umlaut).
const map = [
  ['Ã¤', 'ä'], // Ã¤ -> ä
  ['Ã¶', 'ö'], // Ã¶ -> ö
  ['Ã¼', 'ü'], // Ã¼ -> ü
  ['Ã', 'Ä'], // Ã„ -> Ä
  ['Ã', 'Ö'], // Ã– -> Ö
  ['Ãœ', 'Ü'], // Ãœ -> Ü
  ['Ã', 'ß'], // Ãß -> ß
  ['Ã©', 'é'], // Ã© -> é
  ['Ã¨', 'è'], // Ã¨ -> è
  ['Ã ', 'à'], // Ã  -> à
  ['Ã¡', 'á'], // Ã¡ -> á
  ['Ã­', 'í'], // Ã­ -> í
  ['Ã³', 'ó'], // Ã³ -> ó
  ['Ãº', 'ú'], // Ãº -> ú
  ['Ã±', 'ñ'], // Ã± -> ñ
  ['Ã§', 'ç'], // Ã§ -> ç
  ['Ã', '×'], // Ã— -> ×
  ['Ã¢', 'â'], // Ã¢ -> â (must come after the smart-punct rules)

  // Single-prefix-Â family.
  ['Â·', '·'], // Â· -> ·
  ['Â°', '°'], // Â° -> °
  ['Â´', '´'], // Â´ -> ´
  ['Â®', '®'], // Â® -> ®
  ['Â©', '©'], // Â© -> ©
  ['Â§', '§'], // Â§ -> §
  ['Â ', ' '], // Â<NBSP> -> NBSP

  // Three-byte smart-punctuation mojibake. First byte `â` (U+00E2),
  // second `€` (U+20AC), third the actual punctuation glyph.
  ['â€¦', '…'], // â€¦ -> …
  ['â€“', '–'], // â€“ -> –
  ['â€”', '—'], // â€— -> —
  ['â€˜', '‘'], // â€˜ -> ‘
  ['â€™', '’'], // â€™ -> ’
  ['â€œ', '“'], // â€œ -> “
  ['â€', '”'], // â€<CTRL> -> ”

  // Less common.
  ['âˆž', '∞'], // âˆž -> ∞
  ['âœ“', '✓'], // âœ" -> ✓
];

const files = ['apps/web/src/lib/i18n/de.json', 'apps/web/src/lib/i18n/en.json'];

for (const file of files) {
  let txt = readFileSync(file, 'utf-8');
  let total = 0;
  for (const [bad, good] of map) {
    const before = txt;
    txt = txt.split(bad).join(good);
    if (before !== txt) {
      total += (before.length - txt.length) / Math.max(1, bad.length - good.length);
    }
  }
  try {
    JSON.parse(txt);
  } catch (e) {
    console.error('INVALID', file, e.message);
    continue;
  }
  writeFileSync(file, txt, 'utf-8');
  const remaining = (txt.match(/Ã|Â|â€|âˆ|âœ/g) || [])
    .length;
  console.log(file, 'replacements:', total, 'remaining mojibake bytes:', remaining);
}
