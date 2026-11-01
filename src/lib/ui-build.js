// Where the built UI pages are: `npm run build:ui` (Vite) builds src/ui/<page>/ into dist-ui/<page>/,
// with the files the pages share in dist-ui/assets/. The preloads are not built; they stay in src/ui/.
const path = require('path');

const UI_BUILD = path.join(__dirname, '..', '..', 'dist-ui');

// The built index.html of a page: 'browser', 'suggestions', 'downloads' or 'settings'.
const uiPage = (page) => path.join(UI_BUILD, page, 'index.html');

module.exports = { UI_BUILD, uiPage };
