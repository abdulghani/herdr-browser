// The browser's keyboard shortcuts. Electrobun can't see key presses before a page does, so they
// come two ways: keys with Cmd through the application menu (menu.js), and the rest from the
// preload in every page and in the browser UI (src/ui/page-preload.js), which passes on the keys
// listed by forwardedKeys() and keeps them from the page. A page that stops key events in its own
// capture listener on window before the preload's runs can still swallow them.
const { chordOf } = require('../../lib/keys');
const { prefixActions, directActions } = require('./bindings');

const MODIFIER_KEYS = ['Control', 'Shift', 'Alt', 'Meta'];
const DIGIT_CHORDS = ['alt', 'ctrl'].flatMap((mod) => Array.from({ length: 9 }, (_, i) => `${mod}+${i + 1}`));

function createKeyboard(ctx) {
  const PREFIX_ACTIONS = prefixActions(ctx);
  const DIRECT_ACTIONS = directActions(ctx);
  let prefixArmed = false;
  let prefixTimer = null;

  function setPrefix(armed) {
    prefixArmed = armed;
    clearTimeout(prefixTimer);
    if (armed) prefixTimer = setTimeout(() => setPrefix(false), 2000);
    ctx.workspaces.broadcast();
  }

  // A key press passed on by a page's preload: { key, code, control, alt, meta, shift }.
  function handleKey(input) {
    if (!input || typeof input.key !== 'string' || MODIFIER_KEYS.includes(input.key)) return;
    const chord = chordOf({ code: '', ...input });
    if (prefixArmed) {
      setPrefix(false);
      return handlePrefixKey(chord, input);
    }
    if (chord === 'ctrl+space') return setPrefix(true);
    run(chord);
  }

  // The key pressed after the Ctrl+Space prefix.
  function handlePrefixKey(chord, input) {
    if (PREFIX_ACTIONS[chord]) return PREFIX_ACTIONS[chord]();
    const digit = chord.match(/^(\d)$/);
    if (digit) return ctx.workspaces.selectTab(Number(digit[1]) - 1);
    const shiftDigit = String(input.code).match(/^Digit(\d)$/);
    if (shiftDigit && input.shift) ctx.workspaces.selectWorkspace(Number(shiftDigit[1]) - 1);
  }

  // Run a shortcut by its chord ("cmd+shift+t"), from a page or the menu. False if none.
  function run(chord) {
    const action = digitAction(chord) || directAction(chord);
    if (!action) return false;
    action();
    return true;
  }

  // Alt+digit jumps to that tab, and so does Cmd+1-8 with Cmd+9 the last tab, like other Mac
  // browsers. Ctrl+1-9 jumps to that workspace.
  function digitAction(chord) {
    const [, modifier, digit] = chord.match(/^(alt|cmd|ctrl)\+([1-9])$/) || [];
    if (!modifier) return null;
    const n = Number(digit);
    const { workspaces } = ctx;
    if (modifier === 'alt') return () => workspaces.selectTab(n - 1);
    if (modifier === 'cmd') return () => workspaces.selectTab(n === 9 ? workspaces.activeWs().tabs.length - 1 : n - 1);
    return () => workspaces.selectWorkspace(n - 1);
  }

  function directAction(chord) {
    // Escape closes the downloads panel or the find bar.
    if (chord === 'escape') {
      if (ctx.downloads.isOpen()) return ctx.downloads.hide;
      return ctx.find.has(ctx.workspaces.activeTab().id) ? ctx.find.close : null;
    }
    return DIRECT_ACTIONS[chord];
  }

  // The keys the preloads pass on and keep from the page: everything bound without Cmd (the menu
  // has those) and the prefix. Escape is passed on but left to the page too.
  const forwarded = ['ctrl+space', ...DIGIT_CHORDS, ...Object.keys(DIRECT_ACTIONS).filter((chord) => !chord.includes('cmd'))];

  return {
    handleKey,
    run,
    prefixArmed: () => prefixArmed,
    forwardedKeys: () => forwarded,
  };
}

module.exports = { createKeyboard };
