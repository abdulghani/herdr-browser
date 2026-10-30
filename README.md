# Herdr Browser

A Chromium (Electron) browser laid out like [herdr](https://github.com/herdrdev/herdr):
workspaces stacked in a vertical sidebar, each holding its own row of horizontal tabs.

- Sidebar collapses to an icon rail (`Ctrl+B`)
- Drag tabs to reorder, or drop them onto another workspace
- Double-click a workspace or tab to rename it
- Session (workspaces, tabs, names) is restored on launch

## Install

Download the AppImage from [Releases](https://github.com/abdulghani/herdr-browser/releases), then:

```sh
scripts/install-linux.sh ~/Downloads/HerdrBrowser-<version>-x86_64.AppImage
```

This unpacks it to `~/.local/share/herdr-browser` (no FUSE needed), adds an app-launcher
entry, and puts a `herdr-browser` command in `~/.local/bin`.
Remove it with `scripts/install-linux.sh --uninstall`.

## Run / build

```sh
npm install
npm start               # run from source
npm run dist            # build dist/HerdrBrowser-<version>-x86_64.AppImage
scripts/install-linux.sh   # install the newest build from dist/
```

The AppImage needs FUSE 2 (`sudo pacman -S fuse2` on Arch), or run it with
`APPIMAGE_EXTRACT_AND_RUN=1`.

Set `HERDR_BROWSER_PROFILE=/some/dir` to run with a separate profile, e.g. alongside your
everyday instance while developing.

## Known limitations

- **Passkeys don't work.** Electron has no WebAuthn support on Linux
  ([electron/electron#24573](https://github.com/electron/electron/issues/24573)). Sites are told
  passkeys are unavailable so they offer other sign-in methods, and if one still asks, a bar offers
  to open the page in Chrome/Chromium.

## Keys

Mirrors the herdr config: `Ctrl+Space` is the prefix.

| Action | herdr-style | Browser-style |
|---|---|---|
| New / close / rename tab | prefix `c` / `k` / `r` | `Ctrl+T` / `Ctrl+W` |
| New / close / rename workspace | prefix `C` / `K` / `R` | `Ctrl+Shift+T` |
| Next / previous tab | `Alt+←/→`, prefix `n` / `p` | `Ctrl+Tab` |
| Next / previous workspace | `Alt+↑/↓`, prefix `N` / `P` | `Ctrl+1-9` jumps |
| Jump to tab | `Alt+1-9`, prefix `1-9` | |
| Move tab / workspace | `Alt+Shift+arrows` | |
| Collapse sidebar | prefix `b` | `Ctrl+B` |
| Address bar / back / forward | | `Ctrl+L` / `Ctrl+[` / `Ctrl+]` |
