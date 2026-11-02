// Builds the main process (src/main.ts and what it imports) and the preloads into dist-main/, as
// CommonJS (.cjs) for Electron. Each source file becomes one file in the same folder as in src/, so
// the paths the code builds from __dirname (the preloads, dist-ui/) are the same from the source
// and from the build. The preloads only import 'electron' (and types), so each one is a single file
// that only requires electron, as sandboxed preloads must be.
import path from 'node:path';
import { builtinModules } from 'node:module';
import { defineConfig } from 'vite';

const src = path.resolve(import.meta.dirname, 'src');
const ENTRIES = ['main.ts', 'ui/browser/preload.ts', 'ui/suggestions/preload.ts', 'ui/downloads/preload.ts', 'ui/page-preload.ts'];

export default defineConfig({
  root: import.meta.dirname,
  publicDir: false,
  build: {
    outDir: path.resolve(import.meta.dirname, 'dist-main'),
    emptyOutDir: true,
    // Electron 45's Node and Chromium.
    target: 'node22',
    minify: false,
    sourcemap: false,
    // Built like a server bundle: for Node, with 'electron' and Node's own modules left as require()s.
    ssr: true,
    rolldownOptions: {
      input: ENTRIES.map((entry) => path.join(src, entry)),
      external: ['electron', ...builtinModules, ...builtinModules.map((name) => `node:${name}`)],
      output: {
        format: 'cjs',
        preserveModules: true,
        preserveModulesRoot: src,
        entryFileNames: '[name].cjs',
      },
    },
  },
});
