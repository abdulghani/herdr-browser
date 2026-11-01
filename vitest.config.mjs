import path from 'node:path';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Compiles the .svelte components for their tests, which mount them in jsdom.
  plugins: [svelte({ configFile: false })],
  resolve: {
    // Svelte's browser build, not its server one.
    conditions: ['browser'],
    // Electrobun's page API comes from its devkit in the app; tests use a stand-in.
    alias: [{ find: /^electrobun\/view$/, replacement: path.resolve(import.meta.dirname, 'src/testing/fake-electroview.js') }],
  },
  test: {
    // Tests sit next to the files they test.
    include: ['src/**/*.test.js'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{js,svelte}'],
      exclude: ['**/*.test.js', 'src/testing/**'],
      reporter: ['text', 'text-summary'],
      // CI fails if any of these drops below 80%.
      thresholds: { statements: 80, branches: 80, functions: 80, lines: 80 },
    },
  },
});
