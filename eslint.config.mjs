import js from '@eslint/js';
import globals from 'globals';
import prettier from 'eslint-config-prettier';
import svelte from 'eslint-plugin-svelte';

export default [
  { ignores: ['dist/', 'dist-ui/', 'node_modules/', 'coverage/', '.hutch/', '.cottontail-tmp/'] },
  js.configs.recommended,
  ...svelte.configs.recommended,
  // Main process (run by Bun): the entry point, its services and shared functions.
  {
    files: ['src/*.js', 'src/services/**/*.js', 'src/lib/**/*.js'],
    languageOptions: { sourceType: 'commonjs', globals: { ...globals.node } },
  },
  // The preload every page gets: a plain script, injected as text.
  {
    files: ['src/ui/page-preload.js'],
    languageOptions: { sourceType: 'script', globals: { ...globals.browser } },
  },
  // The pages: Svelte components and the modules next to them, built by Vite for the browser.
  {
    files: ['src/ui/**/*.svelte', 'src/ui/**/*.svelte.js', 'src/ui/**/main.js', 'src/ui/*/*.js'],
    languageOptions: { sourceType: 'module', globals: { ...globals.browser } },
  },
  // Tests (next to the files they test), their helpers and the config files are ES modules.
  {
    files: ['src/**/*.test.js', 'src/testing/**/*.js', '*.config.{js,mjs}'],
    languageOptions: { sourceType: 'module', globals: { ...globals.node } },
  },
  // Tests of the UI and preloads run in jsdom, which provides the browser globals.
  {
    files: ['src/ui/**/*.test.js', 'src/testing/dom.js', 'src/testing/preload.js', 'src/testing/fake-electroview.js'],
    languageOptions: { globals: { ...globals.browser } },
  },
  {
    rules: {
      // `catch {}` is used on purpose where a failure just means "use the default".
      'no-empty': ['error', { allowEmptyCatch: true }],
      // Keep functions small enough to follow: at most 12 paths through each one (also in .svelte files).
      complexity: ['error', 12],
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', caughtErrors: 'none', ignoreRestSiblings: true }],
    },
  },
  // Formatting is Prettier's job.
  prettier,
  ...svelte.configs.prettier,
];
