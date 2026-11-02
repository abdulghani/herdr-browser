import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Compiles the .svelte components for their tests, which mount them in jsdom.
  plugins: [svelte({ configFile: false })],
  // Svelte's browser build, not its server one.
  resolve: { conditions: ['browser'] },
  test: {
    // Tests sit next to the files they test.
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,svelte}'],
      exclude: ['**/*.test.ts', 'src/testing/**'],
      reporter: ['text', 'text-summary'],
      // CI fails if any of these drops below 80%.
      thresholds: { statements: 80, branches: 80, functions: 80, lines: 80 },
    },
  },
});
