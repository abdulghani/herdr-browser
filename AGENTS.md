# AGENTS.md

Notes for coding agents working on Herdr Browser, an Electron browser with herdr-style vertical
workspaces and horizontal tabs.

## Folder structure

```
src/
  main.js          entry point: app setup, the window, wiring the services together
  ipc.js           commands the browser UI sends to the main process
  services/        what the browser does, one folder per area
    workspaces/    workspaces and tabs, saving the session, reopening closed tabs
    tab-views/     the page shown in each tab, its size and place, sleeping tabs, permissions
    history/       browsing history and the address bar suggestions
    settings/      settings, DNS, the herdr:// protocol and the settings page's IPC
    find/          find in page
    keyboard/      keyboard shortcuts (bindings.js holds the key tables)
    passkeys/      the passkey notice and opening a page in another browser
    context-menu/  the right-click menu
    downloads/     saving downloads, the list of recent ones (downloads.json) and the downloads panel
  lib/             small shared functions with no Electron in them (url, keys, fuzzy, files, format,
                   ui-build: where the built pages are)
  ui/              code that runs inside pages, not in the main process (Svelte 5 + Tailwind CSS 4)
    lib/           theme.css (Tailwind, colors, font, sizes; every page imports it), buttons.css
    browser/       the browser UI: App.svelte with Sidebar, WorkspaceItem, TabStrip, TabItem, Toolbar,
                   AddressBar, DownloadButton, NoticeBar, FindBar, RenameInput; preload.js
    suggestions/   the address bar suggestion list (App, SuggestionRow, Highlighted; preload.js)
    downloads/     the downloads panel under the toolbar's download button (App, DownloadRow, Icon; preload.js)
    settings/      the herdr://settings page (App, DnsTab, ShortcutsTab, AboutTab)
    page-preload.js  runs in every web page
  testing/         helpers for tests only (fake Electron, DOM helpers); not shipped
dist-ui/           the built pages (npm run build:ui); git-ignored, shipped in the app
```

- `main.js` creates one shared `ctx` object and each service with `createX(ctx)`. Services reach
  each other through `ctx` when a function runs (`ctx.find.close()`), never at load time, so
  there are no circular requires. Add a new service the same way.
- Put logic in `services/`; put a function in `lib/` only if several places use it and it doesn't
  need Electron.
- Tests sit next to the file they test, as `<name>.test.js`. Main-process tests drive the app
  through `src/testing/main-harness.js` and the fake Electron in `src/testing/fake-electron.js`;
  UI tests mount the Svelte components in jsdom with `@testing-library/svelte` (e.g.
  `src/ui/browser/App.test.js`); wrap actions in `flushSync` so the page updates before you check it.

## The UI pages

Each page in `src/ui/<page>/` (browser, suggestions, downloads, settings) has an `index.html`, a
`main.js` that mounts `App.svelte`, its `app.css` (imports `../lib/theme.css`) and its components
next to them. Write components with runes (`$state`, `$derived`, `$props`, `$effect`) and style
them with Tailwind classes; the colors (`bg-panel`, `text-muted`, `border-border`, ...) and the
sizes the main process lays views out by (`h-tabstrip`, `h-toolbar`, `h-notice`, `h-find`,
`w-sidebar`) come from `@theme` in `src/ui/lib/theme.css`. Keep plain CSS for what classes can't
say (base styles, the sleeping tab ring, window drag regions, keyframes). Don't use inline `style`
attributes or `<style>` blocks: the pages' CSP has no `'unsafe-inline'` (`style:width={...}` is fine).

- Vite (`vite.config.mjs`) builds the pages into `dist-ui/<page>/index.html`, with the files they
  share in `dist-ui/assets/`. `npm start` builds them first; after changing a page, run
  `npm run build:ui` (or `npm start`) to see it in the app.
- The main process loads the built pages (`uiPage()` in `src/lib/ui-build.js`); `herdr://settings/`
  serves `dist-ui/settings/` and `herdr://settings/assets/` serves `dist-ui/assets/`.
- The preloads (`src/ui/**/preload.js`, `src/ui/page-preload.js`) are plain CommonJS files that
  Vite doesn't build; the main process loads them from `src/ui/`. They give the pages
  `window.herdr`, `window.suggestions`, `window.downloads` and `window.herdrSettings`.

## Visual style

Anything visible in `src/ui` follows the style guide in
`.claude/skills/herdr-visual-style/SKILL.md` (a Claude Code skill; other agents can read it as a
plain document): the color tokens, font, sizes the main process depends on, and how bars, tabs,
buttons, panels and states look.

## Checks

Run these before you finish. CI runs the same ones on every pull request.

```sh
npm run lint            # eslint, including a cyclomatic complexity limit of 12 per function
npm run format:check    # prettier (npm run format fixes it)
npm run knip            # no unused files, exports or dependencies
npm run test:coverage   # vitest; fails if coverage of src/ drops below 80%
npm run build:ui        # vite build of the pages into dist-ui/
```

## CHANGELOG.md

**When you add or change a feature, add a line for it under `## Unreleased` at the top of
`CHANGELOG.md`.** Write it for people who use the browser: what they can now do or what works
differently, in plain words, e.g. `- Option+arrow moves the cursor by word in text boxes`.
Refactors, tests and CI changes that users don't notice don't need a line.

Only edit the `## Unreleased` section. When a release is made, the release workflow moves those
lines into the new version's section (above the list of merged pull requests) and starts a new
empty `## Unreleased`.

## Releases

Merging a pull request into `main` releases a new version when it changes `src/` (apart from
tests and `src/testing/`) or `CHANGELOG.md`. Don't bump the version in `package.json` yourself; the
release workflow does it. See the "Releases" section of README.md for the labels that pick a
minor or major version or skip a release.
