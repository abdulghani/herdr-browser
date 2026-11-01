import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.js'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.js'],
      reporter: ['text', 'text-summary'],
      // CI fails if any of these drops below 80%.
      thresholds: { statements: 80, branches: 80, functions: 80, lines: 80 },
    },
  },
});
