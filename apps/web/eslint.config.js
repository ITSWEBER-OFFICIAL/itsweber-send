// Minimal ESLint v9 flat config. Linting is light by design — TypeScript +
// svelte-check carry most of the verification. This config exists so CI
// passes and obvious mistakes are caught.
import ts from 'typescript-eslint';
import svelte from 'eslint-plugin-svelte';

export default [
  { ignores: ['build/', '.svelte-kit/', 'node_modules/', 'dist/', '.turbo/'] },
  ...ts.configs.recommended,
  ...svelte.configs['flat/recommended'],
  {
    files: ['**/*.svelte', '**/*.svelte.ts'],
    languageOptions: {
      parserOptions: { parser: ts.parser },
    },
  },
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-expressions': 'off',
      'no-undef': 'off',
    },
  },
];
