import js from '@eslint/js';
import globals from 'globals';
import prettier from 'eslint-config-prettier';

export default [
  { ignores: ['dist/', 'node_modules/', 'coverage/'] },
  js.configs.recommended,
  // Main process and its modules.
  {
    files: ['src/*.js'],
    languageOptions: { sourceType: 'commonjs', globals: { ...globals.node } },
  },
  // Preloads run in the page with Node's require.
  {
    files: ['src/*preload.js'],
    languageOptions: { globals: { ...globals.browser } },
  },
  // The browser UI, suggestions overlay and settings page are plain browser scripts.
  {
    files: ['src/ui/*.js', 'src/settings/*.js'],
    languageOptions: { sourceType: 'script', globals: { ...globals.browser } },
  },
  {
    files: ['test/**/*.js', '*.config.{js,mjs}'],
    languageOptions: { sourceType: 'module', globals: { ...globals.node } },
  },
  // Tests of the UI scripts run in jsdom, which provides the browser globals.
  {
    files: ['test/ui-*.test.js', 'test/settings-page.test.js', 'test/preloads.test.js', 'test/helpers/dom.js'],
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
