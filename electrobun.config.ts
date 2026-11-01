// Electrobun build config: the app's name, id and version, the main process entry (src/main.js,
// run by Bun) and the built UI pages (dist-ui/, from `npm run build:ui`), which are copied into
// the app and loaded as views://ui/<page>/index.html.
import type { ElectrobunConfig } from 'electrobun';
import pkg from './package.json' with { type: 'json' };

export default {
  app: {
    name: 'Herdr Browser',
    identifier: 'dev.herdr.browser.electrobun',
    version: pkg.version,
    description: pkg.description,
    // So the app can be picked as the default browser (System Settings → Desktop & Dock).
    urlSchemes: ['http', 'https'],
    // No fileAssociations for .html: Electrobun declares its own file types for the extensions
    // (dev.herdr.browser.html, ...) instead of using macOS's public.html, which would take over
    // what .html files are to the whole system. So opening .html files with the app isn't offered.
  },
  build: {
    mainProcess: 'bun',
    bun: { entrypoint: 'src/main.js' },
    copy: { 'dist-ui': 'views/ui' },
    // build/ holds the icon sources, so the built app goes to dist/ (git-ignored).
    buildFolder: 'dist/electrobun',
    artifactFolder: 'dist/artifacts',
    mac: {
      // Pages render in the system's WebKit (WKWebView), not a bundled Chromium.
      bundleCEF: false,
      defaultRenderer: 'native',
      // Made from build/icon.png by scripts/make-iconset.sh (npm run build:icons).
      icons: 'build/icon.iconset',
    },
  },
  runtime: { exitOnLastWindowClosed: true },
} satisfies ElectrobunConfig;
