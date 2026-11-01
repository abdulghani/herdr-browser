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
  lib/             small shared functions with no Electron in them (url, keys, fuzzy)
  ui/              code that runs inside pages, not in the main process
    browser/       the browser UI: sidebar, tabs, address bar (index.html, renderer.js, styles.css, preload.js)
    suggestions/   the address bar suggestion list
    settings/      the herdr://settings page
    page-preload.js  runs in every web page
  testing/         helpers for tests only (fake Electron, DOM helpers); not shipped
```

- `main.js` creates one shared `ctx` object and each service with `createX(ctx)`. Services reach
  each other through `ctx` when a function runs (`ctx.find.close()`), never at load time, so
  there are no circular requires. Add a new service the same way.
- Put logic in `services/`; put a function in `lib/` only if several places use it and it doesn't
  need Electron.
- Tests sit next to the file they test, as `<name>.test.js`. Main-process tests drive the app
  through `src/testing/main-harness.js` and the fake Electron in `src/testing/fake-electron.js`;
  UI tests run in jsdom.

## Checks

Run these before you finish. CI runs the same ones on every pull request.

```sh
npm run lint            # eslint, including a cyclomatic complexity limit of 12 per function
npm run format:check    # prettier (npm run format fixes it)
npm run knip            # no unused files, exports or dependencies
npm run test:coverage   # vitest; fails if coverage of src/ drops below 80%
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
