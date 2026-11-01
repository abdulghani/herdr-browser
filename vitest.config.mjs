import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Tests sit next to the files they test.
    include: ['src/**/*.test.js'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.js'],
      exclude: ['**/*.test.js', 'src/testing/**'],
      reporter: ['text', 'text-summary'],
      // CI fails if any of these drops below 80%.
      thresholds: { statements: 80, branches: 80, functions: 80, lines: 80 },
    },
  },
});
