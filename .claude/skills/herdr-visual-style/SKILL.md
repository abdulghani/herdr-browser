---
name: herdr-visual-style
description: Herdr Browser's visual style (colors, font, sizes, and how bars, tabs, buttons, panels, overlays and states look) and how to apply it with Tailwind in the Svelte UI. Use when adding or changing anything visible in src/ui (browser UI, suggestions list, downloads panel, settings page) or any new page or overlay.
---

# Herdr Browser visual style

Herdr Browser looks like a dark terminal tool: a small fixed palette, one monospace font, flat
surfaces separated by 1px borders, and one blue accent for "selected", "active" and "in progress".
New UI must look like it was always there. Before adding something, find the closest existing
piece in `src/ui/` and copy its classes.

## Where the style lives

- `src/ui/lib/theme.css`: Tailwind import, the `@theme` tokens (colors, font, sizes) and base
  styles. Every page's `app.css` imports it.
- `src/ui/lib/buttons.css`: the plain button used in the browser UI and the downloads panel.
- `src/ui/<page>/app.css`: per-page base rules, keyframes and `@utility` classes that Tailwind
  classes can't express (the sleeping-tab ring, macOS drag regions, download animations).
- Everything else is Tailwind classes in the `.svelte` components. Don't add `<style>` blocks or
  inline `style="…"` attributes: the pages' Content-Security-Policy blocks inline styles
  (`style:width={…}` directives are fine).

## Colors

Only these colors exist; `--color-*: initial` removes Tailwind's palette, so `bg-red-500` won't
work. Use the token names in classes (`bg-panel`, `text-muted`, `border-border`, `text-accent`).

| Token       | Hex       | Used for                                                                   |
| ----------- | --------- | -------------------------------------------------------------------------- |
| `bg`        | `#0b0d10` | Window and page background, the active tab, inputs on panels               |
| `panel`     | `#12151a` | Sidebar, tab strip, cards, overlays, the address bar field                 |
| `panel-2`   | `#1a1e25` | Hover background, selected row or tab in a list, `kbd` keys                |
| `border`    | `#252a33` | Every divider and outline; blank favicon square; track of a progress ring  |
| `fg`        | `#c9d1d9` | Main text, hovered icons                                                   |
| `muted`     | `#6e7681` | Secondary text, idle icons and buttons, hints, URLs, counts                |
| `accent`    | `#58a6ff` | Selection, focus border, active-tab top line, progress, numbers, links     |
| `accent-fg` | `#0b0d10` | Text on an accent background (selected workspace, primary buttons, PREFIX) |
| `notice`    | `#1c2433` | The notice bar under the toolbar                                           |
| `error`     | `#f85149` | Error messages                                                             |
| `ok`        | `#3fb950` | Success messages ("Saved.")                                                |

`bg` is also `BLANK_BG` in the main process and the window's background color, so a blank tab
doesn't flash. Change them together.

## Type

- One font everywhere: `JetBrainsMono Nerd Font`, `JetBrains Mono`, then the system monospace
  (Tailwind's default family is set to it). Never introduce another font.
- Sizes are small and set in px with arbitrary values: browser UI and overlays 12px (body),
  secondary details 11px, tab and workspace numbers 10px, file-type labels 7px. The settings page
  is roomier: body 13px, card headings 15px bold, the page title 20px bold.
- Bold only for headings and short labels (PREFIX, "Downloads"). No italics, no uppercase except
  the sidebar's tiny `workspaces` label (10px, letter-spaced, muted).
- Long text never wraps in bars and rows: use `truncate` (ellipsis). The settings page may wrap.

## Layout sizes the main process depends on

The main process places each tab's page view below the UI by these numbers. If you change one,
change the constant in `src/services/tab-views/tab-views.ts` too.

| Theme spacing       | Size  | Constant                  |
| ------------------- | ----- | ------------------------- |
| `sidebar`           | 220px | `SIDEBAR_WIDTH`           |
| `sidebar-collapsed` | 52px  | `SIDEBAR_COLLAPSED_WIDTH` |
| `tabstrip`          | 36px  | part of `CHROME_HEIGHT`   |
| `toolbar`           | 40px  | part of `CHROME_HEIGHT`   |
| `notice`            | 36px  | `NOTICE_HEIGHT`           |
| `find`              | 36px  | `FIND_HEIGHT`             |

Use them as classes: `h-toolbar`, `w-sidebar`, `h-find`. Overlay sizes (suggestion row height,
downloads panel size) are also mirrored in their services; check the comment next to them.

## Surfaces and borders

- Flat. No drop shadows anywhere, overlays included; depth comes from `bg` vs `panel` vs
  `panel-2` and 1px `border-border` lines. (Inset "shadows" are only used as drop-spot lines.)
- Bars (tab strip, toolbar, notice, find) are full width with `border-b border-border`.
- Cards (settings sections) are `rounded-lg border border-border bg-panel p-5`.
- Overlays drawn over the page (suggestions, downloads) are separate views with a transparent
  body; the visible box is `rounded-lg border border-border bg-panel`, sized to its content.
- Radii: 4px for small buttons (`rounded`), 6px for inputs and list rows (`rounded-md`), 8px for
  cards and overlays (`rounded-lg`), full circles for rings.
- Spacing is tight in the browser UI (gaps of 2–10px, `px-2`/`px-2.5`, 28px controls) and looser
  on the settings page (cards `p-5`, 30px buttons, `gap-6` columns).

## Controls

- **Icon/text buttons** (browser UI, downloads panel; `buttons.css`): no background or border,
  `text-muted`, radius 4px, `padding: 0 6px`; on hover `text-fg bg-panel-2`; disabled at 35%
  opacity. Toolbar buttons are `h-7 min-w-7 text-[14px]`. Icons are Unicode glyphs (☰ ← → ↻ × ⚙︎
  ↑ ↓ ⌕ ↗) or small inline SVGs with `stroke="currentColor"` and `stroke-width="1.5"`, rounded
  caps and joins, so they take the button's color.
- **Primary buttons** (settings page, the notice bar action): `bg-accent text-accent-fg`, 30px
  high (24px in bars), `px-3`/`14px` padding, radius 6px, bold in bars; hover brightens
  (`hover:brightness-110`), not a color change.
- **Text inputs**: `h-7` (30px on settings), `rounded-md border border-border`, `bg-panel` in the
  toolbar or `bg-bg` on a panel, `px-2.5`, `text-fg`, no outline; focus turns the border accent
  (`focus:border-accent`). Placeholders keep the browser default color.
- **Radio choices** (settings): a full-width row `rounded-md px-2.5 py-2 hover:bg-panel-2`, the
  radio tinted `accent-accent`, the name in `fg` and a `text-[12px] text-muted` detail after it.
- **Keys** are shown as `kbd`: on settings a small bordered `panel-2` chip; in the browser's help
  footer just accent-colored text.

## States

- **Selected / active**: accent. The active tab has `bg-bg text-fg` and a 2px accent line on its
  top edge; the selected workspace is filled `bg-accent text-accent-fg`; the selected settings
  tab has a 2px accent left border on `panel-2` with the left corners squared; the selected
  suggestion row is `bg-panel-2`.
- **Idle**: `text-muted`. **Hover**: `text-fg` and `bg-panel-2`. Close buttons on inactive tabs
  appear only on hover (`invisible group-hover:visible`).
- **Focus**: inputs get an accent border; keyboard-focused buttons a 1px accent outline inset
  (`focus-visible:outline-1 focus-visible:-outline-offset-1 focus-visible:outline-accent`).
- **Drag and drop**: the dragged item at 40% opacity; the drop spot is a 2px accent inset line
  (`shadow-[inset_2px_0_0_var(--color-accent)]` on the left for tabs, on top for workspaces), and
  a tab dropped onto a workspace gets a dashed accent outline on that workspace.
- **Sleeping tab**: the favicon is grayscale at 60% opacity inside a dashed muted circle with
  round dash caps and a little side margin (the `sleeping-ring` utility in
  `src/ui/browser/app.css`). Keep this look; it's modeled on Chrome's Memory Saver.
- **Progress**: accent. A ring is an SVG circle (track `stroke-border`, value `stroke-accent`,
  `pathLength="100"`, round caps, starting at 12 o'clock) and spins when the total is unknown; a
  bar is a thin track with an accent fill. Paused progress is muted.
- **Done / cancelled / failed**: "Done · 10 MB" in muted; cancelled and deleted files are muted
  with the name struck through; a failed download's status and other errors are `text-error`;
  confirmations `text-ok`.
- **Missing images**: a broken or absent favicon becomes a 14px `bg-border` square with 2px
  corners, never a broken-image icon.

## Text and wording

- Short, plain labels in sentence case: "Find in page", "Open folder", "Clear", "Look up".
- Status lines join parts with " · " (middle dot with spaces): "3.2 MB of 10 MB · 2 s left".
- Tooltips (`title`) name the action and its shortcut: "Reload (Ctrl+R)", "Settings (Cmd+,)".
- Empty states are one short muted line, centered.

## macOS window chrome

The tab strip is the title bar on macOS. Empty parts of the top bars drag the window: give bars
`app-drag` and anything clickable inside them `app-no-drag` (both only apply under
`.platform-darwin`). Leave room for the window buttons (traffic lights) at the top left, as the
sidebar header and collapsed tab strip already do.

## Checklist for a new piece of UI

1. Reuse an existing component's classes; only tokens from the table above.
2. 12px monospace text, `truncate` in bars and rows, muted secondary text.
3. 1px `border-border` separators, flat surfaces, radius 4/6/8px by size.
4. Hover `panel-2` + `fg`; selection, focus and progress in accent.
5. If it changes a bar height or the sidebar width, update the main-process constant.
6. No `<style>` blocks or inline style attributes; `@utility` in the page's `app.css` for
   anything Tailwind can't express.
7. Check it in the running app next to the existing UI (screenshots of before and after when
   changing existing screens), then run the checks in AGENTS.md.
