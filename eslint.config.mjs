import js from '@eslint/js';
import globals from 'globals';
import prettier from 'eslint-config-prettier';

export default [
  { ignores: ['dist/', 'node_modules/', 'coverage/'] },
  js.configs.recommended,
  // Main process: the entry point, its services and shared functions.
  {
    files: ['src/*.js', 'src/services/**/*.js', 'src/lib/**/*.js'],
    languageOptions: { sourceType: 'commonjs', globals: { ...globals.node } },
  },
  // Preloads run in the page with Node's require.
  {
    files: ['src/ui/**/preload.js', 'src/ui/page-preload.js'],
    languageOptions: { sourceType: 'commonjs', globals: { ...globals.node, ...globals.browser } },
  },
  // The browser UI, suggestions overlay and settings page are plain browser scripts.
  {
    files: ['src/ui/browser/renderer.js', 'src/ui/suggestions/suggest.js', 'src/ui/settings/settings.js'],
    languageOptions: { sourceType: 'script', globals: { ...globals.browser } },
  },
  // Tests (next to the files they test), their helpers and the config files are ES modules.
  {
    files: ['src/**/*.test.js', 'src/testing/**/*.js', '*.config.{js,mjs}'],
    languageOptions: { sourceType: 'module', globals: { ...globals.node } },
  },
  // Tests of the UI scripts and preloads run in jsdom, which provides the browser globals.
  {
    files: ['src/ui/**/*.test.js', 'src/testing/dom.js'],
    languageOptions: { globals: { ...globals.browser } },
  },
  {
    rules: {
      // `catch {}` is used on purpose where a failure just means "use the default".
      'no-empty': ['error', { allowEmptyCatch: true }],
      // Keep functions small enough to follow: at most 12 paths through each one.
      complexity: ['error', 12],
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', caughtErrors: 'none', ignoreRestSiblings: true }],
    },
  },
  // Formatting is Prettier's job.
  prettier,
];
