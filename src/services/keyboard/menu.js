// The macOS menu bar. Its items with a Cmd shortcut are how those shortcuts reach the browser:
// macOS gives menu shortcuts to the menu before the focused page. Each item's action is the chord
// it runs in the keyboard service (bindings.js), so the menu and the key tables can't disagree.
// The Edit menu's roles are what make copy, paste, undo and select all work in pages and text boxes.
const Electrobun = require('electrobun/main');

const { ApplicationMenu } = Electrobun;

// An item that runs a shortcut: its chord (as in bindings.js) and the menu's key equivalent, which
// is the same chord, or '' for chords without Cmd that only show in the menu as a reminder.
const item = (label, chord, accelerator = chord) => ({ label, action: chord, accelerator });
const role = (name) => ({ role: name });
const separator = { type: 'separator' };

const tabNumbers = Array.from({ length: 9 }, (_, i) => item(i === 8 ? 'Last Tab' : `Tab ${i + 1}`, `cmd+${i + 1}`));

const MENU = [
  {
    label: 'Herdr Browser',
    submenu: [
      role('about'),
      separator,
      item('Settings…', 'cmd+,'),
      separator,
      role('hide'),
      role('hideOthers'),
      role('showAll'),
      separator,
      // Not the 'quit' role: with it, Cmd+Q left the app running.
      item('Quit Herdr Browser', 'cmd+q'),
    ],
  },
  {
    label: 'File',
    submenu: [
      item('New Tab', 'cmd+t'),
      item('New Workspace', 'ctrl+shift+t', ''),
      item('Reopen Closed Tab', 'cmd+shift+t'),
      separator,
      item('Open Location…', 'cmd+l'),
      separator,
      item('Close Tab', 'cmd+w'),
    ],
  },
  {
    label: 'Edit',
    submenu: [
      role('undo'),
      role('redo'),
      separator,
      role('cut'),
      role('copy'),
      role('paste'),
      role('pasteAndMatchStyle'),
      role('delete'),
      role('selectAll'),
      separator,
      item('Find…', 'cmd+f'),
      item('Find Next', 'cmd+g'),
      item('Find Previous', 'cmd+shift+g'),
    ],
  },
  {
    label: 'View',
    submenu: [
      item('Reload Page', 'cmd+r'),
      separator,
      item('Zoom In', 'cmd+='),
      item('Zoom Out', 'cmd+-'),
      item('Actual Size', 'cmd+0'),
      separator,
      item('Collapse Sidebar', 'ctrl+b', ''),
      item('Downloads', 'alt+cmd+l', 'cmd+alt+l'),
      item('Developer Tools', 'cmd+shift+j'),
      separator,
      role('toggleFullScreen'),
    ],
  },
  {
    label: 'History',
    submenu: [item('Back', 'cmd+['), item('Forward', 'cmd+]')],
  },
  {
    label: 'Tab',
    submenu: [item('Next Tab', 'cmd+shift+]'), item('Previous Tab', 'cmd+shift+['), separator, ...tabNumbers],
  },
  {
    label: 'Window',
    submenu: [role('minimize'), role('zoom'), separator, role('bringAllToFront')],
  },
];

function createMenu(ctx) {
  function install() {
    ApplicationMenu.setApplicationMenu(MENU);
    ApplicationMenu.on('application-menu-clicked', (e) => {
      const chord = e?.data?.action;
      if (chord) ctx.keyboard.run(chord);
    });
  }

  return { install };
}

module.exports = { createMenu };
