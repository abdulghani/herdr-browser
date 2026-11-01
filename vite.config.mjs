// Builds the UI pages (src/ui/<page>/index.html, Svelte + Tailwind) into dist-ui/, which the main
// process loads from disk (file://) and the herdr:// protocol serves; hence the relative base.
import path from 'node:path';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

const root = path.resolve(import.meta.dirname, 'src/ui');
const PAGES = ['browser', 'suggestions', 'downloads', 'settings'];

export default defineConfig({
  root,
  base: './',
  publicDir: false,
  plugins: [tailwindcss(), svelte({ configFile: false })],
  build: {
    outDir: path.resolve(import.meta.dirname, 'dist-ui'),
    emptyOutDir: true,
    // Keep assets (the settings icon) as files: the pages' CSP allows them from 'self'.
    assetsInlineLimit: 0,
    // Electron's Chromium supports module preloading.
    modulePreload: { polyfill: false },
    rolldownOptions: {
      input: Object.fromEntries(PAGES.map((page) => [page, path.join(root, page, 'index.html')])),
      // The Svelte runtime, shared by the pages, in a chunk of its own.
      output: { codeSplitting: { groups: [{ name: 'svelte', test: /node_modules[\\/]svelte/ }] } },
    },
  },
});
