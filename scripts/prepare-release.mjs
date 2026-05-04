#!/usr/bin/env node
/**
 * Release validator.
 *
 * Reads the project allowlist below and reports any tracked file that does
 * not match. Run with `--check` in CI / locally before tagging a release.
 *
 *   node scripts/prepare-release.mjs --check
 *
 * Exits with non-zero status if any file falls outside the allowlist, so a
 * release pipeline can fail loudly rather than ship something unintended.
 */

import { execSync } from 'node:child_process';
import { resolve } from 'node:path';
import process from 'node:process';

/** Glob-style prefixes that are part of a release. Order does not matter. */
const ALLOWED_PREFIXES = [
  'apps/',
  'packages/',
  'docker/',
  'docs/',
  'brand/',
  'scripts/',
  '.github/',
];

/** Specific root files that are allowed. */
const ALLOWED_ROOT_FILES = new Set([
  '.dockerignore',
  '.editorconfig',
  '.gitattributes',
  '.gitignore',
  '.nvmrc',
  '.prettierignore',
  '.prettierrc.json',
  'CHANGELOG.md',
  'CODE_OF_CONDUCT.md',
  'CONTRIBUTING.md',
  'LICENSE',
  'README.de.md',
  'README.md',
  'commitlint.config.js',
  'package.json',
  'pnpm-lock.yaml',
  'pnpm-workspace.yaml',
  'turbo.json',
  // VS Code workspace file — valid to track, excluded from release artifacts.
  'ITSWEBER Send.code-workspace',
]);

/** Paths that must NOT appear inside the release artifact. */
const NEVER_RELEASE = [
  'docs/previews/',
  'brand/screenshots/',
  // VS Code workspace file contains local path references and is for developer tooling only.
  'ITSWEBER Send.code-workspace',
];

function listTrackedFiles() {
  const out = execSync('git ls-files', { encoding: 'utf8' });
  return out.split('\n').filter((line) => line.length > 0);
}

function isAllowed(file) {
  if (ALLOWED_ROOT_FILES.has(file)) return true;
  return ALLOWED_PREFIXES.some((prefix) => file.startsWith(prefix));
}

function main() {
  const args = new Set(process.argv.slice(2));
  const check = args.has('--check');

  let files;
  try {
    files = listTrackedFiles();
  } catch (err) {
    console.error('Could not list tracked files. Run inside a git working tree.');
    console.error(err.message);
    process.exit(2);
  }

  const offenders = files.filter((f) => !isAllowed(f));
  const inReleaseButShouldNot = files.filter((f) =>
    NEVER_RELEASE.some((prefix) => f.startsWith(prefix)),
  );

  if (offenders.length === 0 && inReleaseButShouldNot.length === 0) {
    console.log(`Release allowlist OK (${files.length} tracked files).`);
    if (check) process.exit(0);
    return;
  }

  if (offenders.length) {
    console.error('Files outside the release allowlist:');
    for (const f of offenders) console.error(`  - ${f}`);
  }
  if (inReleaseButShouldNot.length) {
    console.error('\nFiles tracked but excluded from release artifact:');
    console.error('(These will be stripped from the build context.)');
    for (const f of inReleaseButShouldNot) console.error(`  - ${f}`);
  }

  if (check && offenders.length > 0) {
    console.error('\nRelease check failed. Either move these files out of git or extend the allowlist in scripts/prepare-release.mjs.');
    process.exit(1);
  }
}

main();
