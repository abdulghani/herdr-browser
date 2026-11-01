import js from '@eslint/js';
import globals from 'globals';
import prettier from 'eslint-config-prettier';

export default [
  { ignores: ['dist/', 'node_modules/'] },
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
  {
    rules: {
      // `catch {}` is used on purpose where a failure just means "use the default".
      'no-empty': ['error', { allowEmptyCatch: true }],
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', caughtErrors: 'none', ignoreRestSiblings: true }],
    },
  },
  // Formatting is Prettier's job.
  prettier,
];
