# Herdr Browser

A Chromium (Electron) browser laid out like [herdr](https://github.com/herdrdev/herdr):
workspaces stacked in a vertical sidebar, each holding its own row of horizontal tabs.

- Sidebar collapses to an icon rail (`Ctrl+B`)
- Drag tabs to reorder, or drop them onto another workspace
- Double-click a workspace or tab to rename it
- Session (workspaces, tabs, names, back/forward history) is restored on launch
- The address bar fuzzy-searches your history and open tabs as you type
- Closed tabs and workspaces can be reopened (`Cmd+Shift+T` on macOS), even after a restart
- Tabs left unviewed for 10 minutes sleep to free memory (dimmed icon in a dashed ring) and
  reload, with their history, when selected; tabs in a call or playing sound stay awake
- Settings open in a tab (`Cmd+,`, the ⚙ button, or `herdr://settings`), with DNS, Shortcuts and
  About sections. DNS: use the system's servers or a secure (DNS over HTTPS) one: Cloudflare,
  Google, Quad9, AdGuard or your own, and test a lookup
- Downloads save straight to your Downloads folder (`file (1).zip` if the name is taken). A button
  next to the address bar shows their progress and opens a list of recent ones to open, show in the
  folder, pause, resume, cancel or retry (`Cmd+Option+L` on macOS, `Ctrl+J` elsewhere)

## Install

Download the AppImage from [Releases](https://github.com/abdulghani/herdr-browser/releases), then:

```sh
scripts/install-linux.sh ~/Downloads/HerdrBrowser-<version>-x86_64.AppImage
```

This unpacks it to `~/.local/share/herdr-browser` (no FUSE needed), adds an app-launcher
entry, and puts a `herdr-browser` command in `~/.local/bin`.
Remove it with `scripts/install-linux.sh --uninstall`.

### macOS

Download the `.dmg` for your Mac from [Releases](https://github.com/abdulghani/herdr-browser/releases)
(`arm64` for Apple Silicon, `x64` for Intel), open it, and drag Herdr Browser into Applications.

The app isn't signed with an Apple developer account, so the first launch is blocked with
"Apple could not verify…". Open **System Settings → Privacy & Security** and click **Open Anyway**,
or run `xattr -dr com.apple.quarantine "/Applications/Herdr Browser.app"`.

To build the dmgs yourself: `npm install && npm run dist:mac` (output in `dist/`).

On macOS the tab strip is the title bar, `Cmd+T` opens a tab, `Cmd+L` focuses the address bar,
`Cmd+1-9` switches tabs, `Cmd+F` finds in the page, `Cmd+Option+L` shows downloads, `Cmd+Shift+J` opens DevTools, and the app can be picked as the default browser in System Settings → Desktop & Dock.

## Run / build

Needs Node.js 26, the current LTS (`.nvmrc`; with nvm, run `nvm use`). CI uses the same version.

```sh
npm install
npm start               # build the UI (into dist-ui/) and run from source
npm run build:ui        # only build the UI pages (Vite: Svelte + Tailwind)
npm test                # unit tests (vitest)
npm run test:coverage   # unit tests with coverage; fails below 80%
npm run lint            # eslint
npm run format          # prettier (npm run format:check only checks)
npm run knip            # unused files, exports and dependencies
npm run dist            # build the UI, then dist/HerdrBrowser-<version>-x86_64.AppImage
scripts/install-linux.sh   # install the newest build from dist/
```

The AppImage needs FUSE 2 (`sudo pacman -S fuse2` on Arch), or run it with
`APPIMAGE_EXTRACT_AND_RUN=1`.

Set `HERDR_BROWSER_PROFILE=/some/dir` to run with a separate profile, e.g. alongside your
everyday instance while developing.

## Project layout

Tests sit next to the file they test, as `<name>.test.js`.

- `src/main.js`: starts the app, opens the window and connects the services
- `src/ipc.js`: the commands the browser UI sends to the main process
- `src/services/`: what the browser does, one folder each:
  - `workspaces/`: workspaces and tabs, saving the session, reopening closed tabs
  - `tab-views/`: the page shown in each tab, its size and place, sleeping tabs
  - `history/`: browsing history and the address bar suggestions
  - `settings/`: settings, DNS, and the `herdr://settings` page
  - `find/`: find in page
  - `keyboard/`: keyboard shortcuts
  - `passkeys/`: the passkey notice and opening a page in another browser
  - `context-menu/`: the right-click menu
  - `downloads/`: saving downloads, the list of recent ones, and the downloads panel
- `src/lib/`: small shared functions (URLs, key names, fuzzy matching, file names, sizes and times,
  where the built pages are)
- `src/ui/`: the pages, written as Svelte 5 components styled with Tailwind CSS 4: `browser/`
  (sidebar, tabs, address bar), `suggestions/` (the suggestion list), `downloads/` (the downloads
  panel), `settings/` (the settings page), `lib/` (the shared theme), the preloads that connect each
  page to the main process, and `page-preload.js` (runs in every web page)
- `dist-ui/`: the pages built by Vite (`npm run build:ui`, not in git); the app loads them from here
- `src/testing/`: helpers for the tests (not part of the app)

## Releases

Merging a pull request that changes `src/` or `CHANGELOG.md` makes a new release on its own
(`.github/workflows/release.yml`): the version goes up, the merged pull requests are added to
`CHANGELOG.md`, and the Mac dmgs and the Linux AppImage are built and attached to a GitHub release.
The version goes up by a patch (0.3.0 → 0.3.1) unless the pull request has the label
`release:minor` (→ 0.4.0) or `release:major` (→ 1.0.0). Label it `skip-release` to not release.
Lines written under `## Unreleased` in `CHANGELOG.md` go into the next release's notes.
To release by hand, open the Actions tab, pick "Release" and click "Run workflow". Either way,
nothing is released unless `src/` or `CHANGELOG.md` changed since the last release.

## Known limitations

- **Passkeys don't work.** Electron has no WebAuthn support on Linux or macOS
  ([electron/electron#24573](https://github.com/electron/electron/issues/24573)). Sites are told
  passkeys are unavailable so they offer other sign-in methods, and if one still asks, a bar offers
  to open the page in Chrome/Chromium (on macOS: Chrome, Brave, Edge or Safari).

## Keys

Mirrors the herdr config: `Ctrl+Space` is the prefix.

| Action                         | herdr-style                 | Browser-style                      |
| ------------------------------ | --------------------------- | ---------------------------------- |
| New / close / rename tab       | prefix `c` / `k` / `r`      | `Ctrl+T` / `Ctrl+W`                |
| New / close / rename workspace | prefix `C` / `K` / `R`      | `Ctrl+Shift+T`                     |
| Next / previous tab            | `Alt+←/→`, prefix `n` / `p` | `Ctrl+Tab`                         |
| Next / previous workspace      | `Alt+↑/↓`, prefix `N` / `P` | `Ctrl+1-9` jumps                   |
| Jump to tab                    | `Alt+1-9`, prefix `1-9`     |                                    |
| Move tab / workspace           | `Alt+Shift+arrows`          |                                    |
| Collapse sidebar               | prefix `b`                  | `Ctrl+B`                           |
| Address bar / back / forward   |                             | `Ctrl+L` / `Ctrl+[` / `Ctrl+]`     |
| Settings                       |                             | `Ctrl+,` (`Cmd+,` on macOS)        |
| Downloads                      |                             | `Ctrl+J` (`Cmd+Option+L` on macOS) |

While typing in a text box, `Alt+arrows` (Option on a Mac) move the cursor by word or line as usual,
and `Alt+Shift+arrows` select text, instead of switching or moving tabs.
