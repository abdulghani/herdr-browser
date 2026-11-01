# Herdr Browser (Electrobun experiment)

> **This branch (`electrobun`) is an experiment.** It runs Herdr Browser on
> [Electrobun](https://electrobun.dev) instead of Electron: the main process runs on Bun and pages
> render in macOS's own WebKit (WKWebView, like Safari) instead of a bundled Chromium. The app is
> much smaller (about 32 MB to download instead of about 120 MB), but some features are missing or
> weaker; see [Gaps compared to the Electron build](#gaps-compared-to-the-electron-build).
> **The released app is the Electron build on `main`.** This branch is never released, and it has
> only been tried on macOS (Apple Silicon).

A web browser laid out like [herdr](https://github.com/herdrdev/herdr): workspaces stacked in a
vertical sidebar, each holding its own row of horizontal tabs.

- Sidebar collapses to an icon rail (`Ctrl+B`)
- Drag tabs to reorder, or drop them onto another workspace
- Double-click a workspace or tab to rename it
- Session (workspaces, tabs, names, the page of each tab) is restored on launch
- The address bar fuzzy-searches your history and open tabs as you type
- Closed tabs and workspaces can be reopened (`Cmd+Shift+T`), even after a restart
- Tabs left unviewed for 10 minutes sleep to free memory (dimmed icon in a dashed ring) and load
  their page again when selected; tabs in a call or playing sound stay awake
- Settings open in a tab (`Cmd+,`, the ⚙ button, or `herdr://settings`), with Shortcuts and About
- Downloads go straight to your Downloads folder. A button next to the address bar shows their
  progress and opens a list of recent ones to open, show in the folder, or remove (`Cmd+Option+L`)

## What works and what doesn't

Works: the window with the sidebar, tab strip and toolbar; workspaces and tabs (new, close,
rename, reorder, drag and drop, move to another workspace); the address bar with suggestions; back,
forward, reload and stop; find in page; the settings tab; the downloads list; the right-click menu;
popups and `target=_blank` links open as a new tab; closed-tab reopen; session restore; sleeping
tabs; the herdr keys (`Ctrl+Space` prefix, `Alt+arrows`, `Alt+1-9`, `Ctrl+1-9`) and the usual Mac
`Cmd` shortcuts; being picked as the default browser.

### Gaps compared to the Electron build

| Area                          | Electron build (`main`)                                                  | This build (Electrobun + WebKit)                                                                                                                                                                                                                                                                                         |
| ----------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Engine                        | Chromium (bundled)                                                       | The system's WebKit. Sites see a Safari-like browser; some Chrome-only sites may not work                                                                                                                                                                                                                                |
| User agent                    | Plain Chrome                                                             | WKWebView's default, which has no `Safari/` part, so a few sites treat it as an old or unknown browser. It can't be changed from Electrobun                                                                                                                                                                              |
| Back/forward history          | Saved with the session, kept while a tab sleeps                          | **Not restored** after a restart or after a tab wakes from sleep: only the tab's page comes back. A woken tab says so in a notice bar                                                                                                                                                                                    |
| Keyboard shortcuts            | Every key seen before the page                                           | `Cmd` keys come through the menu bar. The others are passed on by a script in each page, so a page that stops key events in its own early handler can swallow them                                                                                                                                                       |
| Focus                         | Moved with Electron's API                                                | Moved between the browser UI and the page through the Objective-C runtime (Bun FFI), since Electrobun has no call for it. Works in testing; it relies on Electrobun internals that may change                                                                                                                            |
| Passkeys (WebAuthn)           | Not supported; sites are told so, with "Open in Chrome"                  | Not supported either: WebKit has the API, but it fails right away (see below). There is no "Open in another browser" bar any more                                                                                                                                                                                        |
| DNS                           | System or DNS over HTTPS (Cloudflare, Google, …), lookup test            | **None**: WebKit uses the Mac's network settings. The DNS section of Settings is gone                                                                                                                                                                                                                                    |
| Downloads                     | Pause, resume, cancel, retry; sizes, speed and time left                 | Only a percentage while running, then done or failed. **No pause, resume, cancel or retry.** No choice of folder: WebKit saves to `~/Downloads/<name>`, the path Electrobun picks. A finished file wasn't seen in testing: there, `~/Downloads` wasn't writable and the download showed as failed ("Cannot create file") |
| Find in page                  | "2/5" (which match of how many)                                          | "5 found": WebKit doesn't say which match is selected; the count comes from the page's text                                                                                                                                                                                                                              |
| Right-click menu              | Back/Forward greyed out when there's nowhere to go; Inspect at the point | Back/Forward always shown; Inspect opens the inspector without picking the element                                                                                                                                                                                                                                       |
| Zoom                          | Chromium zoom levels                                                     | WebKit page zoom in 10% steps                                                                                                                                                                                                                                                                                            |
| Hard reload                   | `Ctrl+Shift+R` skips the cache                                           | Same as a normal reload                                                                                                                                                                                                                                                                                                  |
| Loading indicator             | Exact                                                                    | Approximate (from WebKit's navigation events)                                                                                                                                                                                                                                                                            |
| Permissions                   | Camera, mic and notifications allowed, others refused                    | WebKit asks the user itself; the browser has no say                                                                                                                                                                                                                                                                      |
| Opening `.html` files         | Offered for `.html` files                                                | Not offered: Electrobun's file associations declare their own `.html` file type for the whole Mac, so they are left out                                                                                                                                                                                                  |
| Single instance, command line | URLs on the command line, second launch hands them over                  | macOS hands over links through the "open URL" event only                                                                                                                                                                                                                                                                 |
| Linux                         | AppImage, `scripts/install-linux.sh`                                     | Not built or tried. Electrobun can target Linux (WebKitGTK), but nothing here is set up or tested for it                                                                                                                                                                                                                 |
| Releases, signing             | Released from `main`                                                     | Never released; the app isn't signed                                                                                                                                                                                                                                                                                     |

**Passkeys, tested on macOS 26 with webauthn.io:** `PublicKeyCredential` exists, but
`isUserVerifyingPlatformAuthenticatorAvailable()` and `isConditionalMediationAvailable()` say
`false` (while `getClientCapabilities()` says everything is available), and pressing Register fails
at once with "The request is not allowed by the user agent or the platform in the current context"
(`NotAllowedError`); no passkey sheet appears. Apple only lets other browsers' WebKit views use
passkeys with the `com.apple.developer.web-browser.public-key-credential` entitlement, which Apple
grants and which needs proper code signing; this build has neither.

**Own bundle id:** the app's bundle id is `dev.herdr.browser.electrobun`, not the Electron build's
`dev.herdr.browser`, so macOS treats them as two apps and both can be installed. Its data is kept
in `~/Library/Application Support/dev.herdr.browser.electrobun/<channel>/` (`stable` for a built
app, `dev` with `npm start`) instead of the Electron build's `~/Library/Application Support/Herdr Browser/`.

## Run / build

Needs Node.js 26 (`.nvmrc`; with nvm, run `nvm use`) for the tools. The first `npm start` (or
`npx electrobun prepare`) downloads Electrobun's toolchain (Hutch, Bun and the Electrobun core) into
`~/.hutch` and its developer kit into `.hutch/` in the project.

```sh
npm install
npm start               # build the UI (dist-ui/) and the app icon, then run (electrobun dev)
npm run build           # the same, then build the app and a dmg into dist/ (electrobun build)
npm run build:ui        # only build the UI pages (Vite: Svelte + Tailwind)
npm test                # unit tests (vitest)
npm run test:coverage   # unit tests with coverage; fails below 80%
npm run lint            # eslint
npm run format          # prettier (npm run format:check only checks)
npm run knip            # unused files, exports and dependencies
```

`npm run build` puts the app in `dist/electrobun/stable-macos-arm64/` and the dmg in
`dist/artifacts/`. The app unpacks itself on first launch. It isn't signed, so macOS blocks the
first launch; see the Electron build's notes on `main` for how to allow it.

Set `HERDR_BROWSER_PROFILE=/some/dir` to run with a separate profile (session, history and the
downloads list), e.g. alongside your everyday instance while developing. Website data (cookies,
storage) is WebKit's and stays per app.

## How it works

- `src/main.js` runs under Bun. It opens one window on the browser UI (`views://ui/browser/`) and
  talks to it over Electrobun's typed RPC (`src/ipc.js`; the page's side is `src/ui/lib/bridge.js`,
  which gives the Svelte components the same `window.herdr` the Electron preload did).
- Each awake tab's page is a native WebKit view: the browser UI puts an `<electrobun-webview>` tag
  for it in the content area (`src/ui/browser/PageViews.svelte`), Electrobun lays the native view
  over that spot, and only the shown tab's view is visible. Main gets the view by its id and loads
  pages into it and follows its events (`src/services/tab-views/`).
- The address bar suggestions and the downloads panel are plain HTML in the browser UI, drawn over
  the page: the page views cut holes ("masks") where they are.
- A script runs in every page (`src/ui/page-preload.js`) and reports what WebKit has no events
  for: title, favicon, the browser's keys, right-clicks, sound and camera use, find matches.

## Project layout

Tests sit next to the file they test, as `<name>.test.js`.

- `src/main.js`: starts the app, opens the window and connects the services
- `src/ipc.js`: the commands the browser UI sends to the main process
- `src/services/`: what the browser does, one folder each:
  - `workspaces/`: workspaces and tabs, saving the session, reopening closed tabs
  - `tab-views/`: the page view of each tab, what its preload reports, sleeping tabs, moving the
    keyboard focus
  - `history/`: browsing history and the address bar suggestions
  - `settings/`: what the `herdr://settings` page shows
  - `find/`: find in page
  - `keyboard/`: keyboard shortcuts and the menu bar
  - `context-menu/`: the right-click menu
  - `downloads/`: the list of recent downloads and the downloads panel
- `src/lib/`: small shared functions (URLs, key names, fuzzy matching, sizes)
- `src/ui/`: the pages, written as Svelte 5 components styled with Tailwind CSS 4: `browser/`
  (sidebar, tabs, address bar, page views, overlays), `suggestions/` (the suggestion list),
  `downloads/` (the downloads panel), `settings/` (the settings page), `lib/` (the shared theme and
  the bridge to the main process), and `page-preload.js` (runs in every page)
- `dist-ui/`: the pages built by Vite (`npm run build:ui`, not in git), copied into the app
- `src/testing/`: helpers for the tests (not part of the app)
- `electrobun.config.ts`: the app's name, id, version and build settings

## Keys

Mirrors the herdr config: `Ctrl+Space` is the prefix.

| Action                         | herdr-style                 | Mac-style                                       |
| ------------------------------ | --------------------------- | ----------------------------------------------- |
| New / close / rename tab       | prefix `c` / `k` / `r`      | `Cmd+T` / `Cmd+W` (also `Ctrl+T` / `Ctrl+W`)    |
| New / close / rename workspace | prefix `C` / `K` / `R`      | `Ctrl+Shift+T`                                  |
| Reopen closed tab              |                             | `Cmd+Shift+T`                                   |
| Next / previous tab            | `Alt+←/→`, prefix `n` / `p` | `Cmd+Shift+]` / `Cmd+Shift+[`, `Ctrl+Tab`       |
| Next / previous workspace      | `Alt+↑/↓`, prefix `N` / `P` | `Ctrl+1-9` jumps                                |
| Jump to tab                    | `Alt+1-9`, prefix `1-9`     | `Cmd+1-8`, `Cmd+9` the last                     |
| Move tab / workspace           | `Alt+Shift+arrows`          |                                                 |
| Collapse sidebar               | prefix `b`                  | `Ctrl+B`                                        |
| Address bar / back / forward   |                             | `Cmd+L` / `Cmd+[` / `Cmd+]` (also `Ctrl+L/[/]`) |
| Find / next / previous         |                             | `Cmd+F` / `Cmd+G` / `Cmd+Shift+G`               |
| Reload, zoom                   |                             | `Cmd+R`, `Cmd+=` / `Cmd+-` / `Cmd+0`            |
| Settings                       |                             | `Cmd+,`                                         |
| Downloads                      |                             | `Cmd+Option+L` (also `Ctrl+J`)                  |
| Developer tools                |                             | `Cmd+Shift+J`                                   |

While typing in a text box, `Alt+arrows` (Option on a Mac) move the cursor by word or line as usual,
and `Alt+Shift+arrows` select text, instead of switching or moving tabs.
