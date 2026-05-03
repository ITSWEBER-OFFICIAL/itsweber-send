#!/usr/bin/env node
/**
 * i18n hard-string audit (Block F).
 *
 * Walks every `*.svelte` and `*.ts` file under `apps/web/src/` and
 * looks for likely user-facing hardcoded strings: any character data
 * inside a Svelte text node, plus quoted strings on common UI props
 * (`placeholder`, `aria-label`, `title`, `alt`), plus arguments to
 * `alert(...)`, `confirm(...)`, `prompt(...)`. Reports findings as
 * file:line warnings, exits 0 always — this is a developer aid, not a
 * CI gate (per docs/V1.1_DECISIONS.md and the Block F brief).
 *
 * The detector errs toward false positives over false negatives. Items
 * that are genuinely fine (technical IDs, brand strings, English-only
 * fallbacks the i18n init relies on, regex/JSDoc text) can be quieted
 * by adding the file path to ALLOWLIST below.
 *
 * Usage:
 *   node scripts/check-i18n.mjs
 *   node scripts/check-i18n.mjs --json    # machine-readable output
 *
 * Run from the repo root.
 */

import { readdir, readFile, stat } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';

const REPO_ROOT = process.cwd();
const SCAN_ROOT = join(REPO_ROOT, 'apps', 'web', 'src');

// File patterns to skip entirely.
const ALLOWLIST = new Set([
  'apps/web/src/lib/i18n/de.json',
  'apps/web/src/lib/i18n/en.json',
  'apps/web/src/lib/i18n/index.ts',
  // Crypto/upload internals deal in technical strings, not user-visible UI.
  'apps/web/src/lib/crypto/index.ts',
  'apps/web/src/lib/crypto/chunked.ts',
]).values
  ? new Set([
      'apps/web/src/lib/i18n/de.json',
      'apps/web/src/lib/i18n/en.json',
      'apps/web/src/lib/i18n/index.ts',
      'apps/web/src/lib/crypto/index.ts',
      'apps/web/src/lib/crypto/chunked.ts',
    ])
  : new Set();

// Identifiers and tokens that are NOT user-facing despite looking like words.
const TECHNICAL_TOKENS = new Set([
  'true',
  'false',
  'null',
  'undefined',
  'application/octet-stream',
  'application/json',
  'application/zip',
  'application/x-www-form-urlencoded',
  'multipart/form-data',
  'no-store',
  'no-cache',
  'same-origin',
  'cors',
  'Bearer',
  'sha256',
  'AES-GCM',
  'PBKDF2',
  'utf8',
  'utf-8',
  'base64url',
  'currentColor',
]);

const args = process.argv.slice(2);
const jsonOutput = args.includes('--json');

async function* walk(dir) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '.svelte-kit' || entry.name === 'build') {
        continue;
      }
      yield* walk(path);
    } else if (entry.isFile()) {
      yield path;
    }
  }
}

/** Return true when `s` is a plausibly user-facing natural-language string. */
function looksHumanFacing(s) {
  const trimmed = s.trim();
  if (trimmed.length < 2) return false;
  if (TECHNICAL_TOKENS.has(trimmed)) return false;
  // Pure URLs, dotted identifiers, hex, numeric, single tokens with no
  // letters or all uppercase → not user-facing prose.
  if (/^https?:\/\//.test(trimmed)) return false;
  if (/^[\w./-]+\.(?:svelte|ts|js|json|md)$/.test(trimmed)) return false;
  if (/^[A-Z][A-Z0-9_]+$/.test(trimmed)) return false;
  if (/^[0-9.,/_-]+$/.test(trimmed)) return false;
  // Must contain at least two letters (German or English) to count as prose.
  const letters = trimmed.match(/[A-Za-zÄÖÜäöüß]/g);
  if (!letters || letters.length < 2) return false;
  // Pure technical identifiers like `auth.login` or `share-id-foo`.
  if (/^[a-z][a-z0-9_-]*(?:\.[a-z][a-z0-9_-]*)+$/.test(trimmed)) return false;
  if (/^[a-z][a-z0-9_-]*$/.test(trimmed) && trimmed.length < 12) return false;
  return true;
}

function isLikelyGerman(s) {
  // Heuristic: contains umlaut or ß, or ends in common German morphemes,
  // or contains a German-flavoured token.
  if (/[äöüÄÖÜß]/.test(s)) return true;
  if (/\b(?:der|die|das|den|dem|und|oder|nicht|ein|eine|einen|ist|sind|wird|werden|kann|können|muss|müssen|bitte|für|mit|ohne|hier|dies|diese|dieser|wenn|dann|auch|sowie|noch|nur|schon|gerade|wirklich|abbrechen|löschen|speichern|hochladen|herunterladen|öffnen|schließen|aktiv|inaktiv|abgelaufen|gerade|verfügbar|aktualisieren|fertig|wähle|wählen|aus)\b/i.test(s)) {
    return true;
  }
  return false;
}

const findings = [];

function record(file, line, kind, value) {
  findings.push({ file, line, kind, value: value.slice(0, 100) });
}

/** Strip block comments `/* … */ /` and JSDoc-leading `*`. */
function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\*.*$/gm, '');
}

function lineOfOffset(src, offset) {
  return src.slice(0, offset).split('\n').length;
}

async function inspectFile(absPath) {
  const rel = relative(REPO_ROOT, absPath).split(sep).join('/');
  if (ALLOWLIST.has(rel)) return;
  if (!/\.(svelte|ts)$/.test(rel)) return;
  // Test files don't ship to users.
  if (/__tests__\//.test(rel) || /\.test\.ts$/.test(rel) || /\.spec\.ts$/.test(rel)) return;

  const raw = await readFile(absPath, 'utf8');
  const src = stripComments(raw);

  // 1. Quoted strings on UI-text props.
  const propRe =
    /(?:placeholder|aria-label|title|alt|aria-description)\s*=\s*(?:"([^"\n]+)"|'([^'\n]+)')/g;
  for (const m of src.matchAll(propRe)) {
    const value = m[1] ?? m[2] ?? '';
    if (!looksHumanFacing(value)) continue;
    if (value.includes('{$_(')) continue;
    record(rel, lineOfOffset(src, m.index ?? 0), 'prop', value);
  }

  // 2. alert/confirm/prompt arguments.
  const dialogRe = /\b(?:alert|confirm|prompt)\(\s*(?:'([^'\n]+)'|"([^"\n]+)"|`([^`\n]+)`)/g;
  for (const m of src.matchAll(dialogRe)) {
    const value = m[1] ?? m[2] ?? m[3] ?? '';
    if (!looksHumanFacing(value)) continue;
    record(rel, lineOfOffset(src, m.index ?? 0), 'dialog', value);
  }

  // 3. Svelte text nodes — anything between a `>` and a `<` that contains
  //    German-looking prose. Crude but catches the bulk.
  if (rel.endsWith('.svelte')) {
    // Strip <script> blocks for text-node scanning.
    const tplOnly = src.replace(/<script[\s\S]*?<\/script>/g, '');
    const textRe = />([^<{}]{2,})</g;
    for (const m of tplOnly.matchAll(textRe)) {
      const value = (m[1] ?? '').trim();
      if (!value) continue;
      if (!looksHumanFacing(value)) continue;
      if (!isLikelyGerman(value)) continue;
      record(rel, lineOfOffset(tplOnly, m.index ?? 0), 'text', value);
    }
  }

  // 4. `errorMsg = '…'` / `phase = 'error'` style assignments where the
  //    right-hand side is a German message.
  const stateAssignRe = /\b(\w*)(?:Msg|Message|Error|Hint|Note|Title)\s*=\s*(?:'([^'\n]+)'|"([^"\n]+)"|`([^`\n]+)`)/g;
  for (const m of src.matchAll(stateAssignRe)) {
    const value = m[2] ?? m[3] ?? m[4] ?? '';
    if (!looksHumanFacing(value)) continue;
    if (!isLikelyGerman(value)) continue;
    record(rel, lineOfOffset(src, m.index ?? 0), 'state', value);
  }
}

async function main() {
  const exists = await stat(SCAN_ROOT).catch(() => null);
  if (!exists) {
    process.stderr.write(`scan root not found: ${SCAN_ROOT}\n`);
    process.exit(0);
  }
  for await (const path of walk(SCAN_ROOT)) {
    await inspectFile(path);
  }

  if (jsonOutput) {
    process.stdout.write(JSON.stringify({ count: findings.length, findings }, null, 2) + '\n');
    return;
  }

  if (findings.length === 0) {
    process.stdout.write('i18n audit: no hardcoded user-facing strings found.\n');
    return;
  }

  // Group by file for readable output.
  const byFile = new Map();
  for (const f of findings) {
    if (!byFile.has(f.file)) byFile.set(f.file, []);
    byFile.get(f.file).push(f);
  }
  process.stdout.write(`i18n audit: ${findings.length} candidates across ${byFile.size} files\n\n`);
  for (const [file, list] of [...byFile.entries()].sort()) {
    process.stdout.write(`${file}\n`);
    for (const f of list.sort((a, b) => a.line - b.line)) {
      process.stdout.write(`  L${String(f.line).padStart(4)}  ${f.kind.padEnd(6)} ${f.value}\n`);
    }
    process.stdout.write('\n');
  }
}

await main();
