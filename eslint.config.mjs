import js from '@eslint/js';
import globals from 'globals';
import prettier from 'eslint-config-prettier';
import svelte from 'eslint-plugin-svelte';
import tseslint from 'typescript-eslint';

export default [
  { ignores: ['dist/', 'dist-ui/', 'dist-main/', 'node_modules/', 'coverage/'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...svelte.configs.recommended,
  // Svelte components use <script lang="ts">.
  {
    files: ['**/*.svelte', '**/*.svelte.ts'],
    languageOptions: { parserOptions: { parser: tseslint.parser, extraFileExtensions: ['.svelte'] } },
  },
  // Everything in src/ is an ES module, compiled by Vite (vite.main.config.ts for the main process
  // and the preloads, vite.config.ts for the pages).
  // Main process: the entry point, its services and shared functions.
  {
    files: ['src/*.ts', 'src/services/**/*.ts', 'src/lib/**/*.ts'],
    languageOptions: { globals: { ...globals.node } },
  },
  // Preloads run in the page, with Electron's process object.
  {
    files: ['src/ui/**/preload.ts', 'src/ui/page-preload.ts'],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },
  // The pages: Svelte components and the modules next to them, built by Vite for the browser.
  {
    files: ['src/ui/**/*.svelte', 'src/ui/**/*.svelte.ts', 'src/ui/**/main.ts', 'src/ui/*/*.ts'],
    ignores: ['src/ui/**/preload.ts'],
    languageOptions: { globals: { ...globals.browser } },
  },
  // Tests (next to the files they test), their helpers and the config files run in Node.
  {
    files: ['src/**/*.test.ts', 'src/testing/**/*.ts', '*.config.{ts,mjs}'],
    languageOptions: { globals: { ...globals.node } },
  },
  // Tests of the UI and preloads run in jsdom, which provides the browser globals.
  {
    files: ['src/ui/**/*.test.ts', 'src/testing/dom.ts'],
    languageOptions: { globals: { ...globals.browser } },
  },
  {
    rules: {
      // `catch {}` is used on purpose where a failure just means "use the default".
      'no-empty': ['error', { allowEmptyCatch: true }],
      // Keep functions small enough to follow: at most 12 paths through each one (also in .svelte files).
      complexity: ['error', 12],
      // TypeScript's version of no-unused-vars, which understands types.
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', caughtErrors: 'none', ignoreRestSiblings: true }],
    },
  },
  // Formatting is Prettier's job.
  prettier,
  ...svelte.configs.prettier,
];
