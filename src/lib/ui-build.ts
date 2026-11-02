// Where the built UI pages are: `npm run build:ui` (Vite) builds src/ui/<page>/ into dist-ui/<page>/,
// with the files the pages share in dist-ui/assets/. The main process itself and the preloads are
// built into dist-main/ (`npm run build:main`), in the same folders as in src/, so this file is
// dist-main/lib/ui-build.cjs when the app runs and dist-ui/ is two folders up either way.
import path from 'path';

export const UI_BUILD = path.join(__dirname, '..', '..', 'dist-ui');

// The built index.html of a page: 'browser', 'suggestions', 'downloads' or 'settings'.
export const uiPage = (page: 'browser' | 'suggestions' | 'downloads' | 'settings'): string => path.join(UI_BUILD, page, 'index.html');
