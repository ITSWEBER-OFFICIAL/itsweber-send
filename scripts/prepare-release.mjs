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
  'unraid/',
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
]);

/**
 * Paths that may stay in the repo but are stripped from the release artifact
 * by the build step. Tracked here is fine; flagged only as informational.
 */
const STRIPPED_FROM_RELEASE = ['docs/previews/', 'brand/screenshots/'];

/**
 * Paths that must NOT be tracked at all. Privacy / internal workflow.
 * Tracking any of these is a release-stopping error.
 */
const FORBIDDEN_DIRS = [
  'docs/internal/',
  'docs/_archive/',
  'docs/audits/',
  'docs/release-prep/',
  '_archive/',
  '.claude/',
  '.agents/',
  '.continue/',
  'memory/',
];

/** Basenames that must never appear anywhere in the repo, on any depth. */
const FORBIDDEN_BASENAMES = new Set([
  'CLAUDE.md',
  'AGENTS.md',
  'OPUS-BRIEFING.md',
  'skills-lock.json',
  '.cursorrules',
]);

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
  const strippedFromRelease = files.filter((f) =>
    STRIPPED_FROM_RELEASE.some((prefix) => f.startsWith(prefix)),
  );
  const forbiddenDirs = files.filter((f) => FORBIDDEN_DIRS.some((prefix) => f.startsWith(prefix)));
  const forbiddenBasenames = files.filter((f) => {
    const basename = f.split('/').pop();
    return FORBIDDEN_BASENAMES.has(basename);
  });

  const hardFails = offenders.length + forbiddenDirs.length + forbiddenBasenames.length;

  if (hardFails === 0 && strippedFromRelease.length === 0) {
    console.log(`Release allowlist OK (${files.length} tracked files).`);
    if (check) process.exit(0);
    return;
  }

  if (offenders.length) {
    console.error('Files outside the release allowlist:');
    for (const f of offenders) console.error(`  - ${f}`);
  }
  if (forbiddenDirs.length) {
    console.error('\nForbidden directory tracked (privacy / internal workflow):');
    for (const f of forbiddenDirs) console.error(`  - ${f}`);
  }
  if (forbiddenBasenames.length) {
    console.error('\nForbidden basename tracked (KI / workflow file):');
    for (const f of forbiddenBasenames) console.error(`  - ${f}`);
  }
  if (strippedFromRelease.length) {
    console.error('\nFiles tracked but stripped from release artifact:');
    console.error('(These will be removed from the build context.)');
    for (const f of strippedFromRelease) console.error(`  - ${f}`);
  }

  if (check && hardFails > 0) {
    console.error(
      '\nRelease check failed. Move offending files out of git, extend the allowlist, or audit the privacy block in scripts/prepare-release.mjs.',
    );
    process.exit(1);
  }
}

main();
