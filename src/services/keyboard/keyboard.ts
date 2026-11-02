// Every key press in the window (the browser UI and each page) comes here first, so the
// browser's shortcuts work wherever the focus is.
import { ipcMain, type Event, type Input, type WebContents } from 'electron';
import { chordOf } from '../../lib/keys';
import { prefixActions, directActions } from './bindings';
import type { Ctx } from '../../types';

const MODIFIER_KEYS = ['Control', 'Shift', 'Alt', 'Meta'];
// Option+arrow, with or without Shift.
const WORD_MOVE = /^alt\+(shift\+)?(left|right|up|down)$/;

export function createKeyboard(ctx: Ctx) {
  const PREFIX_ACTIONS = prefixActions(ctx);
  const DIRECT_ACTIONS = directActions(ctx);
  let prefixArmed = false;
  let prefixTimer: ReturnType<typeof setTimeout> | undefined;
  // webContents ids whose focused element is a text field (reported by the preloads).
  const textFocus = new Set<number>();

  function setPrefix(armed: boolean): void {
    prefixArmed = armed;
    clearTimeout(prefixTimer);
    if (armed) prefixTimer = setTimeout(() => setPrefix(false), 2000);
    ctx.workspaces.broadcast();
  }

  function handleKey(event: Event, input: Input, wc: WebContents) {
    if (input.type !== 'keyDown' || MODIFIER_KEYS.includes(input.key)) return;
    const chord = chordOf(input);

    if (prefixArmed) {
      event.preventDefault();
      setPrefix(false);
      return handlePrefixKey(chord, input);
    }
    // In a text field, Option+arrow (with or without Shift) moves or selects by word, like Chrome.
    if (textFocus.has(wc.id) && WORD_MOVE.test(chord)) return;
    if (chord === 'ctrl+space') {
      event.preventDefault();
      return setPrefix(true);
    }

    const action = digitAction(chord) || directAction(chord);
    if (action) {
      event.preventDefault();
      action();
    }
  }

  // The key pressed after the Ctrl+Space prefix.
  function handlePrefixKey(chord: string, input: Input) {
    if (PREFIX_ACTIONS[chord]) return PREFIX_ACTIONS[chord]();
    const digit = chord.match(/^(\d)$/);
    if (digit) return ctx.workspaces.selectTab(Number(digit[1]) - 1);
    const shiftDigit = input.code.match(/^Digit(\d)$/);
    if (shiftDigit && input.shift) ctx.workspaces.selectWorkspace(Number(shiftDigit[1]) - 1);
  }

  // Alt+digit jumps to that tab, and so does Cmd+1-8 with Cmd+9 the last tab, like other Mac
  // browsers. Ctrl+1-9 jumps to that workspace.
  function digitAction(chord: string): (() => void) | null {
    const [, modifier, digit] = chord.match(/^(alt|cmd|ctrl)\+(\d)$/) || [];
    if (!modifier) return null;
    const n = Number(digit);
    const { workspaces } = ctx;
    if (modifier === 'alt') return () => workspaces.selectTab(n - 1);
    if (n === 0) return null; // Ctrl+0 resets the zoom (directActions)
    if (modifier === 'cmd') return () => workspaces.selectTab(n === 9 ? workspaces.activeWs().tabs.length - 1 : n - 1);
    return () => workspaces.selectWorkspace(n - 1);
  }

  function directAction(chord: string): (() => unknown) | null | undefined {
    // Escape closes the downloads panel or the find bar, wherever the focus is.
    if (chord === 'escape') {
      if (ctx.downloads.isOpen()) return ctx.downloads.hide;
      return ctx.find.has(ctx.workspaces.activeTab().id) ? ctx.find.close : null;
    }
    return DIRECT_ACTIONS[chord];
  }

  ipcMain.on('text-focus', (e, typing: boolean) => (typing ? textFocus.add(e.sender.id) : textFocus.delete(e.sender.id)));

  return {
    handleKey,
    prefixArmed: () => prefixArmed,
    // A new page starts with nothing focused.
    forgetTextFocus: (wcId: number) => textFocus.delete(wcId),
  };
}
