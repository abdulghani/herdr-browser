# AGENTS.md

Notes for coding agents working on Herdr Browser, an Electron browser with herdr-style vertical
workspaces and horizontal tabs.

## Folder structure

```
src/
  main.ts          entry point: app setup, the window, wiring the services together
  ipc.ts           commands the browser UI sends to the main process
  types.ts         the shapes shared across the app (tabs, workspaces, what the pages are sent, ctx)
  services/        what the browser does, one folder per area
    workspaces/    workspaces and tabs, saving the session, reopening closed tabs
    tab-views/     the page shown in each tab, its size and place, sleeping tabs, permissions
    history/       browsing history and the address bar suggestions
    settings/      settings, DNS, the herdr:// protocol and the settings page's IPC
    find/          find in page
    keyboard/      keyboard shortcuts (bindings.ts holds the key tables)
    passkeys/      the passkey notice and opening a page in another browser
    context-menu/  the right-click menu
    downloads/     saving downloads, the list of recent ones (downloads.json) and the downloads panel
  lib/             small shared functions with no Electron in them (url, keys, fuzzy, files, format,
                   ui-build: where the built pages are)
  ui/              code that runs inside pages, not in the main process (Svelte 5 + Tailwind CSS 4)
    lib/           theme.css (Tailwind, colors, font, sizes; every page imports it), buttons.css
    browser/       the browser UI: App.svelte with Sidebar, WorkspaceItem, TabStrip, TabItem, Toolbar,
                   AddressBar, DownloadButton, NoticeBar, FindBar, RenameInput; preload.ts
    suggestions/   the address bar suggestion list (App, SuggestionRow, Highlighted; preload.ts)
    downloads/     the downloads panel under the toolbar's download button (App, DownloadRow, Icon; preload.ts)
    settings/      the herdr://settings page (App, DnsTab, ShortcutsTab, AboutTab)
    page-preload.ts  runs in every web page
  testing/         helpers for tests only (fake Electron, DOM helpers); not shipped
dist-ui/           the built pages (npm run build:ui); git-ignored, shipped in the app
dist-main/         the built main process and preloads as .cjs files (npm run build:main); git-ignored,
                   shipped in the app; package.json's "main" is dist-main/main.cjs
```

All code is TypeScript in strict mode, and the Svelte components use `<script lang="ts">`. Give
things real types: the shared shapes live in `src/types.ts`, and each preload exports the type of
the API it gives its page (e.g. `HerdrApi`). Keep `any` and `@ts-expect-error` rare, with a comment
saying why.

- `main.ts` creates one shared `ctx` object (typed as `Ctx` in `src/types.ts`) and each service
  with `createX(ctx)`. Services reach each other through `ctx` when a function runs
  (`ctx.find.close()`), never at load time, so there are no circular imports. Add a new service the
  same way, and add it to `Ctx`.
- Put logic in `services/`; put a function in `lib/` only if several places use it and it doesn't
  need Electron.
- Tests sit next to the file they test, as `<name>.test.ts`, and are type-checked like the rest.
  Main-process tests drive the app through `src/testing/main-harness.ts` and the fake Electron in
  `src/testing/fake-electron.ts`; UI tests mount the Svelte components in jsdom with
  `@testing-library/svelte` (e.g. `src/ui/browser/App.test.ts`); wrap actions in `flushSync` so the
  page updates before you check it. Vitest runs the tests from the source; they don't need a build.
  Where a test knows something is there, say so with `!` (e.g. `document.getElementById(id)!`).

## The UI pages

Each page in `src/ui/<page>/` (browser, suggestions, downloads, settings) has an `index.html`, a
`main.ts` that mounts `App.svelte`, its `app.css` (imports `../lib/theme.css`) and its components
next to them. Write components with runes (`$state`, `$derived`, `$props`, `$effect`) and style
them with Tailwind classes; the colors (`bg-panel`, `text-muted`, `border-border`, ...) and the
sizes the main process lays views out by (`h-tabstrip`, `h-toolbar`, `h-notice`, `h-find`,
`w-sidebar`) come from `@theme` in `src/ui/lib/theme.css`. Keep plain CSS for what classes can't
say (base styles, the sleeping tab ring, window drag regions, keyframes). Don't use inline `style`
attributes or `<style>` blocks: the pages' CSP has no `'unsafe-inline'` (`style:width={...}` is fine).

- Vite (`vite.config.ts`) builds the pages into `dist-ui/<page>/index.html`, with the files they
  share in `dist-ui/assets/`.
- A second Vite config (`vite.main.config.ts`) builds the main process (`src/main.ts` and what it
  imports) and the four preloads into `dist-main/`, as CommonJS `.cjs` files for Electron. Each
  source file becomes one file in the same folder as in `src/` (`src/services/find/find.ts` ->
  `dist-main/services/find/find.cjs`), so paths built from `__dirname` work the same way. `electron`
  and Node's own modules stay as `require()`s. A new preload must be added to `ENTRIES` there.
- `npm run build` runs both (`build:ui`, then `build:main`); `npm start` builds and then runs the
  app. After changing anything in `src/`, run `npm run build` (or `npm start`) to see it in the app.
- The main process loads the built pages (`uiPage()` in `src/lib/ui-build.ts`); `herdr://settings/`
  serves `dist-ui/settings/` and `herdr://settings/assets/` serves `dist-ui/assets/`.
- The preloads (`src/ui/**/preload.ts`, `src/ui/page-preload.ts`) run sandboxed, so they may only
  import `electron` (and types). The main process loads the built ones from `dist-main/ui/`. They
  give the pages `window.herdr`, `window.suggestions`, `window.downloads` and
  `window.herdrSettings`, and declare those on `Window` so the pages get their types.

## Visual style

Anything visible in `src/ui` follows the style guide in
`.claude/skills/herdr-visual-style/SKILL.md` (a Claude Code skill; other agents can read it as a
plain document): the color tokens, font, sizes the main process depends on, and how bars, tabs,
buttons, panels and states look.

## Checks

Use Node.js 26 (`.nvmrc`; `nvm use`). Run these before you finish. CI runs the same ones, on the
same Node version, on every pull request.

```sh
npm run lint            # eslint, including a cyclomatic complexity limit of 12 per function
npm run format:check    # prettier (npm run format fixes it)
npm run knip            # no unused files, exports or dependencies
npm run typecheck       # tsc and svelte-check, tests included; no errors or warnings
npm run test:coverage   # vitest; fails if coverage of src/ drops below 80%
npm run build           # vite build of the pages into dist-ui/ and the main process into dist-main/
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
