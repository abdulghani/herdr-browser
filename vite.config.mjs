// Builds the UI pages (src/ui/<page>/index.html, Svelte + Tailwind) into dist-ui/, which the
// Electrobun build copies into the app as views://ui/ (electrobun.config.ts); hence the relative
// base, so the pages find dist-ui/assets/ as views://ui/assets/.
import fs from 'node:fs';
import path from 'node:path';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

const root = path.resolve(import.meta.dirname, 'src/ui');
const PAGES = ['browser', 'settings'];

// 'electrobun/view' (Electroview, for the RPC with the main process) comes from the devkit that
// `electrobun dev`/`build` (or `npx electrobun prepare`) sets up in .hutch/devkit, not from npm.
const ELECTROVIEW = path.resolve(import.meta.dirname, '.hutch/devkit/api/browser/index.ts');
if (!fs.existsSync(ELECTROVIEW)) throw new Error('Electrobun devkit missing: run `npx electrobun prepare` first.');

export default defineConfig({
  root,
  base: './',
  publicDir: false,
  plugins: [tailwindcss(), svelte({ configFile: false })],
  resolve: { alias: [{ find: /^electrobun\/view$/, replacement: ELECTROVIEW }] },
  build: {
    outDir: path.resolve(import.meta.dirname, 'dist-ui'),
    emptyOutDir: true,
    // Keep assets (the settings icon) as files: the pages' CSP allows them from 'self'.
    assetsInlineLimit: 0,
    // WebKit supports module preloading.
    modulePreload: { polyfill: false },
    rolldownOptions: {
      input: Object.fromEntries(PAGES.map((page) => [page, path.join(root, page, 'index.html')])),
      // The Svelte runtime, shared by the pages, in a chunk of its own.
      output: { codeSplitting: { groups: [{ name: 'svelte', test: /node_modules[\\/]svelte/ }] } },
    },
  },
});
