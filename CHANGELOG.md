# Changelog

## Unreleased

- Tabs widen again to fill the tab bar after you close some, up to their full width, like in Chrome

## v0.3.10 (2026-11-02)

- Sign-in popups (like "Sign in with Google") open in their own small window, like in Chrome, so signing in works
- Fixed a crash when a page closed itself

* Open sign-in popups in their own window; fix a crash when a page closes itself by @abdulghani in https://github.com/abdulghani/herdr-browser/pull/31


**Full Changelog**: https://github.com/abdulghani/herdr-browser/compare/v0.3.9...v0.3.10

## v0.3.9 (2026-11-02)

* Move the source to TypeScript by @abdulghani in https://github.com/abdulghani/herdr-browser/pull/30


**Full Changelog**: https://github.com/abdulghani/herdr-browser/compare/v0.3.8...v0.3.9

## v0.3.8 (2026-11-02)

- Right-click an image to open it in a new tab, save it (asks where), copy it or copy its address, like in Chrome

* Add image actions to the right-click menu, like Chrome by @abdulghani in https://github.com/abdulghani/herdr-browser/pull/29


**Full Changelog**: https://github.com/abdulghani/herdr-browser/compare/v0.3.7...v0.3.8

## v0.3.7 (2026-11-02)

- The address bar shows the new address after you click a link in the page, even if you had clicked in the address bar before

* Use Node.js 26 LTS locally and in CI by @abdulghani in https://github.com/abdulghani/herdr-browser/pull/26
* Make the address bar follow links clicked in the page by @abdulghani in https://github.com/abdulghani/herdr-browser/pull/28


**Full Changelog**: https://github.com/abdulghani/herdr-browser/compare/v0.3.6...v0.3.7

## v0.3.6 (2026-11-01)

* Add a visual style skill for the UI by @abdulghani in https://github.com/abdulghani/herdr-browser/pull/25
* Rebuild the UI with Svelte 5 and Tailwind CSS 4, built by Vite by @abdulghani in https://github.com/abdulghani/herdr-browser/pull/24


**Full Changelog**: https://github.com/abdulghani/herdr-browser/compare/v0.3.5...v0.3.6

## v0.3.5 (2026-11-01)

- Downloads: files save straight to your Downloads folder, and a download button next to the address bar shows their progress and lists recent downloads, where you can open, pause, resume, cancel or retry them (`Cmd+Option+L` on macOS, `Ctrl+J` elsewhere)

* Check that releases show the new version in settings' About tab by @abdulghani in https://github.com/abdulghani/herdr-browser/pull/22
* Add a downloads button and panel next to the address bar by @abdulghani in https://github.com/abdulghani/herdr-browser/pull/23


**Full Changelog**: https://github.com/abdulghani/herdr-browser/compare/v0.3.4...v0.3.5

## v0.3.4 (2026-11-01)

* Release only when src/ or CHANGELOG.md changed by @abdulghani in https://github.com/abdulghani/herdr-browser/pull/17
* Rename CI to Checks and run it only on pull requests by @abdulghani in https://github.com/abdulghani/herdr-browser/pull/16
* Add AGENTS.md and an Unreleased section to the changelog by @abdulghani in https://github.com/abdulghani/herdr-browser/pull/21
* Limit cyclomatic complexity to 12 in eslint by @abdulghani in https://github.com/abdulghani/herdr-browser/pull/18
* Measure test coverage and require at least 80% by @abdulghani in https://github.com/abdulghani/herdr-browser/pull/19
* Split the app into services and lib, with tests next to the code by @abdulghani in https://github.com/abdulghani/herdr-browser/pull/20


**Full Changelog**: https://github.com/abdulghani/herdr-browser/compare/v0.3.3...v0.3.4

## v0.3.3 (2026-11-01)

* Add CI checks: unit tests, lint, formatting and knip by @abdulghani in https://github.com/abdulghani/herdr-browser/pull/15


**Full Changelog**: https://github.com/abdulghani/herdr-browser/compare/v0.3.2...v0.3.3

## v0.3.2 (2026-11-01)

* Add a settings tab with DNS, Shortcuts and About by @abdulghani in https://github.com/abdulghani/herdr-browser/pull/14


**Full Changelog**: https://github.com/abdulghani/herdr-browser/compare/v0.3.1...v0.3.2

## v0.3.1 (2026-11-01)

* Release 0.3.0 by @abdulghani in https://github.com/abdulghani/herdr-browser/pull/10
* Let Option+arrow move by word in text boxes by @abdulghani in https://github.com/abdulghani/herdr-browser/pull/11
* Release automatically when a source change is merged by @abdulghani in https://github.com/abdulghani/herdr-browser/pull/12
* Let the release workflow be run by hand by @abdulghani in https://github.com/abdulghani/herdr-browser/pull/13


**Full Changelog**: https://github.com/abdulghani/herdr-browser/compare/v0.3.0...v0.3.1
