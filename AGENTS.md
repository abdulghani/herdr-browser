# AGENTS.md

Notes for coding agents working on Herdr Browser, a browser with herdr-style vertical workspaces
and horizontal tabs.

**This is the `electrobun` branch: an experiment that runs the browser on
[Electrobun](https://electrobun.dev) (Bun main process, pages in macOS's WebKit) instead of
Electron.** `main` is the Electron build and the one that is released; this branch is never
released. README.md lists what works here and every gap compared to the Electron build; keep that
list up to date when you add, fix or drop something.

## Folder structure

```
electrobun.config.ts  the app's name, id, version, entry point and what goes into the app
src/
  main.js          entry point (runs under Bun): the window, the RPC, wiring the services together
  ipc.js           what the browser UI asks the main process (RPC handlers)
  services/        what the browser does, one folder per area
    workspaces/    workspaces and tabs, saving the session, reopening closed tabs
    tab-views/     each tab's page view (tab-views.js), what the page preload reports (pages.js),
                   sleeping tabs, moving the keyboard focus (native-focus.js: Bun FFI, macOS only)
    history/       browsing history and the address bar suggestions
    settings/      what the herdr://settings page shows (settings-page.js)
    find/          find in page
    keyboard/      keyboard shortcuts (bindings.js holds the key tables) and the menu bar (menu.js)
    context-menu/  the right-click menu
    downloads/     the list of recent downloads (downloads.json) and the downloads panel
  lib/             small shared functions with no Electrobun in them (url, keys, fuzzy, format)
  ui/              code that runs inside pages, not in the main process (Svelte 5 + Tailwind CSS 4)
    lib/           theme.css (Tailwind, colors, font, sizes; every page imports it), buttons.css,
                   bridge.js (window.herdr, window.suggestions, window.downloads over Electrobun RPC)
    browser/       the browser UI: App.svelte with Sidebar, WorkspaceItem, TabStrip, TabItem, Toolbar,
                   AddressBar, DownloadButton, NoticeBar, FindBar, RenameInput, PageViews (the tabs'
                   <electrobun-webview> tags), Overlays (suggestions and downloads drawn over the page)
    suggestions/   the address bar suggestion list (App, SuggestionRow, Highlighted)
    downloads/     the downloads panel (App, DownloadRow, Icon)
    settings/      the herdr://settings page (App, ShortcutsTab, AboutTab)
    page-preload.js  runs in every page (and in the browser UI): keys, title, favicon, right-click…
  testing/         helpers for tests only (fake Electrobun, fake Electroview, DOM helpers); not shipped
dist-ui/           the built pages (npm run build:ui); git-ignored, copied into the app as views://ui/
.hutch/            Electrobun's developer kit (npx electrobun prepare); git-ignored
```

- `main.js` creates one shared `ctx` object and each service with `createX(ctx)`. Services reach
  each other through `ctx` when a function runs (`ctx.find.close()`), never at load time, so
  there are no circular requires. Add a new service the same way. Messages to the browser UI go
  through `ctx.ui.send(channel, payload)`.
- The main process is CommonJS run by Bun (bundled by `electrobun dev`/`build`); it requires
  Electrobun as `require('electrobun/main')`. Use Node's built-in modules (`fs`, `path`,
  `child_process`) rather than Bun-only APIs, so the tests can run it on Node; keep anything
  Bun-only in a small adapter like `native-focus.js` that does nothing elsewhere.
- Put logic in `services/`; put a function in `lib/` only if several places use it and it doesn't
  need Electrobun.
- Tests sit next to the file they test, as `<name>.test.js`. Main-process tests drive the app
  through `src/testing/main-harness.js` and the fake Electrobun in `src/testing/fake-electrobun.js`
  (it also plays the browser UI's part of making a page view for each tab); UI tests mount the
  Svelte components in jsdom with `@testing-library/svelte` (e.g. `src/ui/browser/App.test.js`,
  with a fake `<electrobun-webview>` from `src/testing/dom.js`); wrap actions in `flushSync` so the
  page updates before you check it. `electrobun/view` resolves to `src/testing/fake-electroview.js`
  in tests (vitest.config.mjs).

## How the pieces talk

- Browser UI ↔ main: Electrobun RPC. The UI calls `herdr.cmd(name, arg)` (the `cmd` message,
  `src/ipc.js`), `herdr.suggest(query)` (a request) and `herdr.tabView(tabId, webviewId)`; main
  sends `state` on every change plus a few channels (`rename`, `focus-address`, `page-action`, …).
- Pages → main: `src/ui/page-preload.js` calls `window.__electrobunSendToHost({ type, … })`, which
  arrives as the view's `host-message` event (handled in `src/services/tab-views/pages.js`). Main →
  page: `view.executeJavascript(...)`. Tab pages are sandboxed (no RPC).
- The preload runs once per document, but a tab's first page (about:blank) hands its `window` to
  the next page, so window listeners are added once per window.
- Keys: `Cmd` shortcuts are menu items (`src/services/keyboard/menu.js`, action = the chord in
  `bindings.js`); other shortcuts are listed in `state.keys` and passed on by the preload.

## The UI pages

Each page in `src/ui/<page>/` that is its own page (browser, settings) has an `index.html`, a
`main.js` that mounts `App.svelte`, its `app.css` (imports `../lib/theme.css`) and its components
next to them; `suggestions/` and `downloads/` are components the browser page draws over the page
views. Write components with runes (`$state`, `$derived`, `$props`, `$effect`) and style them with
Tailwind classes; the colors (`bg-panel`, `text-muted`, `border-border`, ...) and sizes
(`h-tabstrip`, `h-toolbar`, `h-notice`, `h-find`, `w-sidebar`) come from `@theme` in
`src/ui/lib/theme.css`. Keep plain CSS for what classes can't say (base styles, the sleeping tab
ring, window drag regions, keyframes). Don't use inline `style` attributes or `<style>` blocks: the
pages' CSP has no `'unsafe-inline'` (`style:width={...}` is fine).

- Vite (`vite.config.mjs`) builds the pages into `dist-ui/<page>/index.html`, with the files they
  share in `dist-ui/assets/`; the Electrobun build copies `dist-ui/` into the app, where the pages
  are `views://ui/<page>/index.html`. `npm start` builds them first.
- `herdr://settings/` is what tabs and the address bar show for `views://ui/settings/index.html`
  (`pageUrl`/`tabUrl` in `src/lib/url.js`).
- The Vite build needs Electrobun's devkit for `electrobun/view`: run `npx electrobun prepare` once
  (`npm start` does it too).

## Visual style

Anything visible in `src/ui` follows the style guide in
`.claude/skills/herdr-visual-style/SKILL.md` (a Claude Code skill; other agents can read it as a
plain document): the color tokens, font, sizes the main process depends on, and how bars, tabs,
buttons, panels and states look.

## Checks

Use Node.js 26 (`.nvmrc`; `nvm use`) for the tools. Run these before you finish. CI runs the same
ones, on the same Node version, on every pull request.

```sh
npm run lint            # eslint, including a cyclomatic complexity limit of 12 per function
npm run format:check    # prettier (npm run format fixes it)
npm run knip            # no unused files, exports or dependencies
npm run test:coverage   # vitest; fails if coverage of src/ drops below 80%
npm run build:ui        # vite build of the pages into dist-ui/ (needs npx electrobun prepare once)
```

To see a change in the app: `npm start` (electrobun dev). `npm run build` makes the app and a dmg in
`dist/`.

## CHANGELOG.md and releases

This branch is not released, so it gets no CHANGELOG.md lines and no version bumps. Note what
users would notice in README.md instead (the "Gaps compared to the Electron build" table).
