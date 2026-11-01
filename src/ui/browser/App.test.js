// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/svelte';
import { flushSync } from 'svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineFakeWebviewTag, webviewTags } from '../../testing/dom.js';
import App from './App.svelte';

defineFakeWebviewTag();

let herdr;
let listeners;
const $ = (id) => document.getElementById(id);
const flush = async () => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
  flushSync();
};

function start(platform = 'darwin') {
  cleanup();
  listeners = {};
  herdr = {
    platform,
    cmd: vi.fn(),
    ready: vi.fn(),
    suggest: vi.fn(async () => []),
    on: vi.fn((channel, fn) => (listeners[channel] = fn)),
    tabView: vi.fn(),
  };
  window.herdr = herdr;
  window.suggestions = { onRows: vi.fn(), onSelect: vi.fn(), hover: vi.fn(), pick: vi.fn() };
  window.downloads = { onRows: vi.fn(), action: vi.fn(), clear: vi.fn(), openFolder: vi.fn(), pointer: vi.fn() };
  webviewTags.nav = { canGoBack: false, canGoForward: false };
  render(App);
}

function makeState(changes = {}) {
  return {
    workspaces: [
      {
        id: 'w1',
        name: 'claims migration',
        activeTab: 0,
        tabs: [
          { id: 't1', title: 'Example', url: 'https://example.com/', favicon: 'https://example.com/favicon.ico' },
          { id: 't2', title: '', url: 'about:blank' },
        ],
      },
      {
        id: 'w2',
        name: 'research',
        activeTab: 0,
        tabs: [{ id: 't3', title: 'Docs', customName: 'My docs', url: 'https://docs.example/' }],
      },
      { id: 'w3', name: '  ', activeTab: 0, tabs: [{ id: 't4', title: 'Four', url: 'https://four.example/' }] },
    ],
    activeWs: 0,
    awake: ['t1', 't3'],
    pages: [
      { id: 't1', src: 'https://example.com/' },
      { id: 't3', src: 'https://docs.example/' },
    ],
    shown: 't1',
    keys: ['ctrl+t'],
    loading: false,
    sidebarCollapsed: false,
    prefixArmed: false,
    find: null,
    ...changes,
  };
}

// Same state with another active tab in the first workspace.
const onTab = (activeTab, changes) => {
  const s = makeState(changes);
  s.workspaces[0].activeTab = activeTab;
  return s;
};

// Run something, then let Svelte update the page.
const act = (fn) => {
  const result = fn();
  flushSync();
  return result;
};
const emit = (channel, payload) => act(() => listeners[channel](payload));
const click = (target) => act(() => target.click());
const fire = (target, event) => {
  act(() => target.dispatchEvent(event));
  return event;
};
const mouse = (target, type, extra = {}) => fire(target, new MouseEvent(type, { bubbles: true, cancelable: true, ...extra }));
const typeInto = (input, value) => {
  input.value = value;
  fire(input, new Event('input', { bubbles: true }));
};
const key = (target, k, extra = {}) => fire(target, new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...extra }));
const root = () => $('app');
const workspaces = () => [...document.querySelectorAll('#workspaces li.ws')];
const tabs = () => [...document.querySelectorAll('#tabs li')];
const commands = () => herdr.cmd.mock.calls;

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
  vi.stubGlobal('requestAnimationFrame', (fn) => fn());
  start();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('start up', () => {
  it('tells main it is ready and marks the platform', () => {
    expect(herdr.ready).toHaveBeenCalled();
    expect(root().classList.contains('platform-darwin')).toBe(true);
  });

  it('stops or reloads before any state arrives', () => {
    click($('reload'));
    expect(herdr.cmd).toHaveBeenCalledWith('reload');
  });
});

describe('rendering state', () => {
  beforeEach(() => emit('state', makeState()));

  it('lists the workspaces', () => {
    const items = workspaces();
    expect(items.map((li) => li.querySelector('.ws-name').textContent)).toEqual(['claims migration', 'research', '  ']);
    expect(items.map((li) => li.querySelector('.ws-num').textContent)).toEqual(['1', '2', '3']);
    expect(items.map((li) => li.querySelector('.ws-count').textContent)).toEqual(['2', '1', '1']);
    expect(items.map((li) => li.classList.contains('active'))).toEqual([true, false, false]);
    expect(items[0].title).toBe('claims migration (2 tabs)\n  Example\n  about:blank');
    expect(items[1].dataset.id).toBe('w2');
    expect(items[0].draggable).toBe(true);
    // The initials and the add button only show in the collapsed rail.
    expect(document.querySelector('#workspaces .ws-icon')).toBeNull();
    expect(document.querySelector('#workspaces .ws-add')).toBeNull();
  });

  it('lists the tabs of the active workspace', () => {
    const items = tabs();
    expect(items.map((li) => li.querySelector('.tab-title').textContent)).toEqual(['Example', 'about:blank']);
    expect(items.map((li) => ['active', 'asleep'].filter((c) => li.classList.contains(c)))).toEqual([['active'], ['asleep']]);
    expect(items.map((li) => li.querySelector('.tab-num').textContent)).toEqual(['1', '2']);
    expect(items[0].title).toBe('Example\nhttps://example.com/');
    expect(items[0].querySelector('img').getAttribute('src')).toBe('https://example.com/favicon.ico');
    // A tab that isn't loaded shows its icon in the dashed ring.
    expect(items[1].querySelector('.favicon-blank').classList.contains('sleeping-ring')).toBe(true);
    expect(items[0].querySelector('img').classList.contains('sleeping-ring')).toBe(false);
    expect(Element.prototype.scrollIntoView).toHaveBeenCalledWith({ block: 'nearest', inline: 'nearest' });
  });

  it('uses a custom tab name', () => {
    emit('state', makeState({ activeWs: 1 }));
    expect(tabs()[0].querySelector('.tab-title').textContent).toBe('My docs');
  });

  it('swaps a broken favicon for a blank one', () => {
    fire(tabs()[0].querySelector('img'), new Event('error'));
    expect(tabs()[0].querySelector('img')).toBeNull();
    expect(tabs()[0].querySelector('.favicon-blank')).not.toBeNull();
  });

  it('shows the toolbar state', () => {
    expect($('back').disabled).toBe(true);
    expect($('forward').disabled).toBe(true);
    expect($('reload').textContent).toBe('↻');
    expect($('reload').title).toBe('Reload (Ctrl+R)');
    expect($('prefix').hidden).toBe(true);
    expect($('address').value).toBe('https://example.com/');
    expect($('collapse').textContent).toBe('«');
    expect($('collapse').title).toBe('Collapse sidebar (Ctrl+B)');
    expect(root().classList.contains('collapsed')).toBe(false);
    expect($('notice').hidden).toBe(true);
    expect($('find').hidden).toBe(true);
  });

  it('shows loading, the armed prefix and a collapsed sidebar', () => {
    emit('state', makeState({ loading: true, prefixArmed: true, sidebarCollapsed: true }));
    expect($('reload').textContent).toBe('×');
    expect($('reload').title).toBe('Stop');
    expect($('prefix').hidden).toBe(false);
    expect(root().classList.contains('collapsed')).toBe(true);
    expect($('collapse').textContent).toBe('»');
    expect($('collapse').title).toBe('Expand sidebar (Ctrl+B)');
    click($('reload'));
    expect(herdr.cmd).toHaveBeenLastCalledWith('stop');
  });

  it('shows initials, numbers and an add button in the collapsed rail', () => {
    emit('state', makeState({ sidebarCollapsed: true }));
    const items = workspaces();
    expect(items.map((li) => li.querySelector('.ws-icon').firstChild.textContent)).toEqual(['CM', 'RE', '?']);
    expect(items.map((li) => li.querySelector('.ws-badge').textContent)).toEqual(['1', '2', '3']);
    expect(items[0].querySelector('.ws-name')).toBeNull();
    expect($('new-ws')).toBeNull();
    expect($('help')).toBeNull();
    click(document.querySelector('#workspaces .ws-add'));
    expect(herdr.cmd).toHaveBeenLastCalledWith('newWorkspace');
  });

  it('leaves the address bar empty on a blank page', () => {
    emit('state', onTab(1));
    expect($('address').value).toBe('');
  });

  it("doesn't overwrite what is typed in the address bar, unless the tab changes", () => {
    $('address').focus();
    typeInto($('address'), 'typing');
    emit('state', makeState());
    expect($('address').value).toBe('typing');
    emit('state', onTab(1));
    expect($('address').value).toBe('');
  });
});

describe('macOS title bar', () => {
  it('makes the empty top bars drag the window, but not what is clickable in them', () => {
    emit('state', makeState());
    expect(document.querySelector('#sidebar header').classList.contains('app-drag')).toBe(true);
    expect($('tabstrip').classList.contains('app-drag')).toBe(true);
    for (const el of [$('new-ws'), $('collapse'), $('new-tab'), tabs()[0]]) expect(el.classList.contains('app-no-drag')).toBe(true);
    // Room for the window buttons.
    expect(document.querySelector('#sidebar header').classList.contains('pl-20')).toBe(true);
    emit('state', makeState({ sidebarCollapsed: true }));
    expect(document.querySelector('#sidebar header').classList.contains('pt-tabstrip')).toBe(true);
    expect($('tabstrip').classList.contains('pl-7')).toBe(true);
  });

  it('leaves no room for window buttons elsewhere', () => {
    start('linux');
    emit('state', makeState({ sidebarCollapsed: true }));
    expect(document.querySelector('#sidebar header').classList.contains('pt-tabstrip')).toBe(false);
    expect($('tabstrip').classList.contains('pl-7')).toBe(false);
    emit('state', makeState());
    expect(document.querySelector('#sidebar header').classList.contains('pl-20')).toBe(false);
  });
});

describe('notice bar', () => {
  it('says when a tab that slept lost its back/forward history', () => {
    const s = makeState();
    s.workspaces[0].tabs[0].notice = { kind: 'woke' };
    emit('state', s);
    expect($('notice').hidden).toBe(false);
    expect($('notice-text').textContent).toMatch(/asleep to save memory/);
    expect($('notice-text').title).toMatch(/can't keep their back\/forward history/);
  });

  it('shows nothing for a notice it does not know', () => {
    const s = makeState();
    s.workspaces[0].tabs[0].notice = { kind: 'passkey' };
    emit('state', s);
    expect($('notice').hidden).toBe(true);
  });
});

describe('find bar', () => {
  it('shows the search and match count', () => {
    emit('state', makeState({ find: { text: 'cat', total: 5 } }));
    expect($('find').hidden).toBe(false);
    expect($('find-input').value).toBe('cat');
    expect($('find-count').textContent).toBe('5 found');
    expect($('find-count').classList.contains('none')).toBe(false);
  });

  it('marks no matches, and shows no count for an empty search', () => {
    emit('state', makeState({ find: { text: 'zzz', total: 0 } }));
    expect($('find-count').textContent).toBe('0 found');
    expect($('find-count').classList.contains('none')).toBe(true);
    emit('state', makeState({ find: { text: '', active: 0, total: 0 } }));
    expect($('find-count').textContent).toBe('');
    expect($('find-count').classList.contains('none')).toBe(false);
  });

  it("doesn't overwrite what is typed, unless the tab changes", async () => {
    emit('state', makeState({ find: { text: 'ca', active: 0, total: 0 } }));
    emit('focus-find');
    await flush();
    expect(document.activeElement).toBe($('find-input'));
    typeInto($('find-input'), 'cat');
    emit('state', makeState({ find: { text: 'ca', active: 1, total: 1 } }));
    expect($('find-input').value).toBe('cat');
    emit('state', onTab(1, { find: { text: 'dog', active: 0, total: 0 } }));
    expect($('find-input').value).toBe('dog');
  });

  it('sends what is typed and the find keys', () => {
    emit('state', makeState({ find: { text: '', active: 0, total: 0 } }));
    const input = $('find-input');
    typeInto(input, 'cat');
    expect(herdr.cmd).toHaveBeenLastCalledWith('find', 'cat');
    key(input, 'Enter');
    expect(herdr.cmd).toHaveBeenLastCalledWith('findNext', true);
    key(input, 'Enter', { shiftKey: true });
    expect(herdr.cmd).toHaveBeenLastCalledWith('findNext', false);
    key(input, 'Escape');
    expect(herdr.cmd).toHaveBeenLastCalledWith('closeFind');
    const count = commands().length;
    key(input, 'a');
    expect(commands()).toHaveLength(count);
  });
});

describe('buttons and clicks', () => {
  beforeEach(async () => {
    webviewTags.nav = { canGoBack: true, canGoForward: true };
    const s = makeState();
    s.workspaces[0].tabs[0].notice = { kind: 'woke' };
    emit('state', s);
    // The tags get their views, then the back and forward answers come.
    await new Promise((resolve) => setTimeout(resolve, 50));
    await flush();
  });

  it.each([
    ['new-ws', 'newWorkspace'],
    ['new-tab', 'newTab'],
    ['back', 'back'],
    ['forward', 'forward'],
    ['reload', 'reload'],
    ['sidebar-toggle', 'toggleSidebar'],
    ['settings', 'openSettings'],
    ['collapse', 'toggleSidebar'],
    ['notice-dismiss', 'dismissNotice'],
    ['find-close', 'closeFind'],
  ])('%s sends %s', (id, name) => {
    click($(id));
    expect(herdr.cmd).toHaveBeenLastCalledWith(name);
  });

  it('find arrows go to the previous and next match', () => {
    click($('find-prev'));
    expect(herdr.cmd).toHaveBeenLastCalledWith('findNext', false);
    click($('find-next'));
    expect(herdr.cmd).toHaveBeenLastCalledWith('findNext', true);
  });

  it('selects and closes workspaces', () => {
    click(workspaces()[1]);
    expect(herdr.cmd).toHaveBeenLastCalledWith('selectWorkspace', 'w2');
    herdr.cmd.mockClear();
    click(workspaces()[1].querySelector('.close'));
    expect(commands()).toEqual([['closeWorkspace', 'w2']]);
  });

  it('selects and closes tabs, also with a middle click', () => {
    click(tabs()[1]);
    expect(herdr.cmd).toHaveBeenLastCalledWith('selectTab', 't2');
    herdr.cmd.mockClear();
    click(tabs()[1].querySelector('.close'));
    expect(commands()).toEqual([['closeTab', 't2']]);
    mouse(tabs()[0], 'auxclick', { button: 1 });
    expect(herdr.cmd).toHaveBeenLastCalledWith('closeTab', 't1');
    herdr.cmd.mockClear();
    mouse(tabs()[0], 'auxclick', { button: 2 });
    expect(herdr.cmd).not.toHaveBeenCalled();
  });

  it('opens a tab on a double click in the empty tab strip', () => {
    mouse($('tabstrip'), 'dblclick');
    expect(herdr.cmd).toHaveBeenLastCalledWith('newTab');
    mouse($('tabs'), 'dblclick');
    expect(commands()).toEqual([['newTab'], ['newTab']]);
    mouse($('new-tab'), 'dblclick');
    expect(commands()).toHaveLength(2);
  });

  it('toggles the key help', () => {
    expect($('help').hidden).toBe(true);
    click($('help-toggle'));
    expect($('help').hidden).toBe(false);
    emit('toggle-help');
    expect($('help').hidden).toBe(true);
  });
});

describe('address bar', () => {
  beforeEach(() => emit('state', makeState()));

  it('goes to what was typed', () => {
    const address = $('address');
    address.focus();
    typeInto(address, 'example.org');
    const e = new Event('submit', { cancelable: true });
    fire($('address-form'), e);
    expect(e.defaultPrevented).toBe(true);
    expect(herdr.cmd).toHaveBeenCalledWith('navigate', 'example.org');
    expect(document.activeElement).not.toBe(address);
  });

  it('focuses on request and selects the address', () => {
    emit('focus-address');
    const address = $('address');
    expect(document.activeElement).toBe(address);
    expect([address.selectionStart, address.selectionEnd]).toEqual([0, address.value.length]);
  });

  it('Escape returns to the page', () => {
    const address = $('address');
    address.focus();
    key(address, 'Escape');
    expect(herdr.cmd).toHaveBeenLastCalledWith('focusContent');
  });

  it('ignores Enter and arrows with no suggestions open', () => {
    const address = $('address');
    address.focus();
    expect(key(address, 'Enter').defaultPrevented).toBe(false);
    expect(key(address, 'ArrowDown').defaultPrevented).toBe(false);
    expect(commands()).toEqual([]);
  });
});

describe('address bar suggestions', () => {
  const history = { kind: 'history', title: 'GitHub', displayUrl: 'github.com', url: 'https://github.com/' };
  const tab = { kind: 'tab', title: 'Docs', displayUrl: 'docs.example', tabId: 't3' };
  const shown = () => commands().filter(([name]) => name === 'showSuggestions');

  async function type(text, matches = [history, tab]) {
    herdr.suggest.mockResolvedValueOnce(matches);
    typeInto($('address'), text);
    await flush();
  }

  beforeEach(() => {
    emit('state', makeState());
    $('address').focus();
    herdr.cmd.mockClear();
  });

  it("doesn't list on focus for a page that is open", () => {
    expect(herdr.suggest).not.toHaveBeenCalled();
  });

  it('lists recent pages on focus in a blank tab', async () => {
    $('address').blur();
    emit('state', onTab(1));
    herdr.suggest.mockResolvedValueOnce([history]);
    $('address').focus();
    await flush();
    expect(herdr.suggest).toHaveBeenCalledWith('');
    expect(shown()).toEqual([['showSuggestions', { rows: [history], selected: 0, rect: { x: 0, y: 4, width: 0 } }]]);
  });

  it("doesn't open an empty list", async () => {
    await type('', []);
    expect(herdr.suggest).toHaveBeenCalledWith('');
    expect(commands()).toEqual([]);
  });

  it('lists what was typed first, then the matches', async () => {
    await type(' git ');
    expect(herdr.suggest).toHaveBeenCalledWith('git');
    expect(shown().at(-1)[1].rows).toEqual([{ kind: 'typed', query: 'git' }, history, tab]);
  });

  it('drops results that a newer keystroke replaced', async () => {
    let slow;
    herdr.suggest.mockReturnValueOnce(new Promise((resolve) => (slow = resolve)));
    typeInto($('address'), 'g');
    await type('gi');
    slow([tab]);
    await flush();
    expect(shown()).toHaveLength(1);
    expect(shown()[0][1].rows[0]).toEqual({ kind: 'typed', query: 'gi' });
  });

  it('drops results that arrive after focus left', async () => {
    let slow;
    herdr.suggest.mockReturnValueOnce(new Promise((resolve) => (slow = resolve)));
    typeInto($('address'), 'g');
    $('address').blur();
    slow([tab]);
    await flush();
    expect(shown()).toHaveLength(0);
  });

  it('closes when typing without focus', async () => {
    await type('git');
    $('address').blur();
    typeInto($('address'), 'gitx');
    expect(herdr.cmd).toHaveBeenLastCalledWith('hideSuggestions');
  });

  it('moves the selection with the arrows, wrapping around', async () => {
    await type('git');
    const address = $('address');
    expect(key(address, 'ArrowDown').defaultPrevented).toBe(true);
    expect(herdr.cmd).toHaveBeenLastCalledWith('selectSuggestion', 1);
    key(address, 'ArrowUp');
    key(address, 'ArrowUp');
    expect(herdr.cmd).toHaveBeenLastCalledWith('selectSuggestion', 2);
    key(address, 'ArrowDown');
    expect(herdr.cmd).toHaveBeenLastCalledWith('selectSuggestion', 0);
  });

  it('Enter goes to what was typed', async () => {
    await type('git');
    expect(key($('address'), 'Enter').defaultPrevented).toBe(true);
    expect(commands().slice(-2)).toEqual([['navigate', 'git'], ['hideSuggestions']]);
    expect(document.activeElement).not.toBe($('address'));
  });

  it('Enter opens the selected page', async () => {
    await type('git');
    key($('address'), 'ArrowDown');
    key($('address'), 'Enter');
    expect(herdr.cmd).toHaveBeenCalledWith('navigate', 'https://github.com/');
  });

  it('Enter switches to the selected tab, also after a hover', async () => {
    await type('git');
    emit('suggest-hover', 2);
    key($('address'), 'Enter');
    expect(herdr.cmd).toHaveBeenCalledWith('switchToTab', 't3');
  });

  it('a pick in the overlay opens that row', async () => {
    await type('git');
    emit('suggest-pick', 1);
    expect(commands().slice(-2)).toEqual([['navigate', 'https://github.com/'], ['hideSuggestions']]);
  });

  it('ignores a pick of a row that is gone', async () => {
    await type('git');
    herdr.cmd.mockClear();
    emit('suggest-pick', 9);
    expect(commands()).toEqual([]);
  });

  it('Escape closes the list but keeps the text', async () => {
    await type('git');
    key($('address'), 'Escape');
    expect(herdr.cmd).toHaveBeenLastCalledWith('hideSuggestions');
    expect($('address').value).toBe('git');
    expect(document.activeElement).toBe($('address'));
  });

  it('closes when the overlay asks', async () => {
    await type('git');
    emit('suggest-close');
    expect(herdr.cmd).toHaveBeenLastCalledWith('hideSuggestions');
  });

  it('closes when the tab changes', async () => {
    await type('git');
    emit('state', onTab(1));
    expect(herdr.cmd).toHaveBeenLastCalledWith('hideSuggestions');
  });

  it('moves with the window while open', async () => {
    fire(window, new Event('resize'));
    expect(shown()).toHaveLength(0);
    await type('git');
    fire(window, new Event('resize'));
    expect(shown()).toHaveLength(2);
  });

  it('closes a moment after the address bar loses focus, unless it comes back', async () => {
    await type('git');
    vi.useFakeTimers();
    $('address').blur();
    $('address').focus();
    vi.advanceTimersByTime(200);
    expect(herdr.cmd).not.toHaveBeenCalledWith('hideSuggestions');
    $('address').blur();
    vi.advanceTimersByTime(100);
    expect(herdr.cmd).not.toHaveBeenCalledWith('hideSuggestions');
    vi.advanceTimersByTime(100);
    expect(herdr.cmd).toHaveBeenLastCalledWith('hideSuggestions');
  });
});

describe('inline rename', () => {
  beforeEach(() => emit('state', makeState()));
  const renameInput = () => document.querySelector('input.rename');

  it('renames a tab on double click', () => {
    mouse(tabs()[0], 'dblclick');
    const input = renameInput();
    expect(input.parentElement.classList.contains('tab-title')).toBe(true);
    expect(input.value).toBe('Example');
    expect(document.activeElement).toBe(input);
    expect([input.selectionStart, input.selectionEnd]).toEqual([0, 7]);
    // Clicks in the input don't select or rename the tab again.
    click(input);
    mouse(input, 'dblclick');
    expect(commands()).toEqual([]);
    // State updates wait until the rename is done.
    emit('state', makeState({ loading: true }));
    expect(renameInput()).toBe(input);
    expect($('reload').textContent).toBe('↻');

    input.value = 'Mine';
    key(input, 'Enter');
    expect(commands()).toEqual([['renameTab', { id: 't1', name: 'Mine' }], ['focusContent']]);
    expect(renameInput()).toBeNull();
    // Then the newest state shows.
    expect($('reload').textContent).toBe('×');
    fire(input, new FocusEvent('blur'));
    expect(commands()).toHaveLength(2);
  });

  it('cancels on Escape', () => {
    mouse(tabs()[0], 'dblclick');
    key(renameInput(), 'x');
    key(renameInput(), 'Escape');
    expect(commands()).toEqual([['focusContent']]);
    expect(tabs()[0].querySelector('.tab-title').textContent).toBe('Example');
  });

  it('saves when focus leaves', () => {
    emit('rename', { kind: 'tab', id: 't2' });
    const input = renameInput();
    input.value = 'Blank';
    act(() => input.blur());
    expect(herdr.cmd).toHaveBeenCalledWith('renameTab', { id: 't2', name: 'Blank' });
  });

  it('renames a workspace on double click', () => {
    mouse(workspaces()[1], 'dblclick');
    const input = renameInput();
    expect(input.parentElement.classList.contains('ws-name')).toBe(true);
    input.value = 'reading';
    key(input, 'Enter');
    expect(commands()).toEqual([['renameWorkspace', { id: 'w2', name: 'reading' }], ['focusContent']]);
  });

  it('expands a collapsed sidebar for the rename and collapses it after', () => {
    emit('state', makeState({ sidebarCollapsed: true }));
    emit('rename', { kind: 'workspace', id: 'w1' });
    expect(commands()).toEqual([['toggleSidebar']]);
    expect(renameInput()).toBeNull();
    emit('state', makeState({ sidebarCollapsed: false }));
    const input = renameInput();
    expect(input.value).toBe('claims migration');
    key(input, 'Enter');
    expect(commands().slice(1)).toEqual([['renameWorkspace', { id: 'w1', name: 'claims migration' }], ['toggleSidebar'], ['focusContent']]);
    // Later state updates don't start another rename.
    emit('state', makeState({ sidebarCollapsed: true }));
    expect(renameInput()).toBeNull();
  });

  it('a double click in the collapsed rail expands it for the rename too', () => {
    emit('state', makeState({ sidebarCollapsed: true }));
    mouse(workspaces()[1], 'dblclick');
    expect(commands()).toEqual([['toggleSidebar']]);
  });

  it('ignores a rename of something that is gone', () => {
    emit('rename', { kind: 'tab', id: 'nope' });
    emit('rename', { kind: 'workspace', id: 'nope' });
    expect(renameInput()).toBeNull();
  });
});

describe('rename before any state', () => {
  it('does nothing', () => {
    emit('rename', { kind: 'workspace', id: 'w1' });
    emit('rename', { kind: 'tab', id: 't1' });
    expect(document.querySelector('input.rename')).toBeNull();
    expect(herdr.cmd).not.toHaveBeenCalled();
  });
});

describe('drag and drop', () => {
  beforeEach(() => emit('state', makeState()));

  const drag = (target, type) => {
    const e = new Event(type, { cancelable: true, bubbles: true });
    e.dataTransfer = {};
    return fire(target, e);
  };
  const marks = () => document.querySelectorAll('.dragging, .drop-before, .drop-into');

  it('moves a tab before another tab', () => {
    const [first, second] = tabs();
    const start = drag(first, 'dragstart');
    expect(start.dataTransfer.effectAllowed).toBe('move');
    expect(first.classList.contains('dragging')).toBe(true);
    expect(drag(second, 'dragover').defaultPrevented).toBe(true);
    expect(second.classList.contains('drop-before')).toBe(true);
    drag(second, 'dragleave');
    expect(second.classList.contains('drop-before')).toBe(false);
    drag(second, 'dragover');
    expect(drag(second, 'drop').defaultPrevented).toBe(true);
    expect(herdr.cmd).toHaveBeenCalledWith('moveTabTo', { tabId: 't1', wsId: 'w1', index: 1 });
    drag(first, 'dragend');
    expect(marks()).toHaveLength(0);
  });

  it('only clears the drop mark of the item the drag left', () => {
    const [first, second] = tabs();
    drag(first, 'dragstart');
    drag(second, 'dragover');
    drag(workspaces()[1], 'dragleave');
    expect(second.classList.contains('drop-before')).toBe(true);
    drag(first, 'dragend');
  });

  it('ignores dropping a tab on itself', () => {
    const [first] = tabs();
    drag(first, 'dragstart');
    expect(drag(first, 'dragover').defaultPrevented).toBe(false);
    drag(first, 'drop');
    expect(herdr.cmd).not.toHaveBeenCalled();
    drag(first, 'dragend');
  });

  it('moves a tab into another workspace', () => {
    drag(tabs()[0], 'dragstart');
    const target = workspaces()[1];
    drag(target, 'dragover');
    expect(target.classList.contains('drop-into')).toBe(true);
    drag(target, 'drop');
    expect(herdr.cmd).toHaveBeenCalledWith('moveTabTo', { tabId: 't1', wsId: 'w2' });
    drag(tabs()[0], 'dragend');
  });

  it('reorders workspaces', () => {
    drag(workspaces()[0], 'dragstart');
    expect(workspaces()[0].classList.contains('dragging')).toBe(true);
    const target = workspaces()[2];
    drag(target, 'dragover');
    expect(target.classList.contains('drop-before')).toBe(true);
    drag(target, 'drop');
    expect(herdr.cmd).toHaveBeenCalledWith('moveWorkspaceTo', { wsId: 'w1', index: 2 });
    drag(workspaces()[0], 'dragend');
  });

  it("doesn't drop a workspace on a tab", () => {
    drag(workspaces()[1], 'dragstart');
    expect(drag(tabs()[0], 'dragover').defaultPrevented).toBe(false);
    drag(tabs()[0], 'drop');
    expect(herdr.cmd).not.toHaveBeenCalled();
    drag(workspaces()[1], 'dragend');
  });

  it('ignores drags that started elsewhere', () => {
    expect(drag(tabs()[0], 'dragover').defaultPrevented).toBe(false);
    drag(workspaces()[0], 'drop');
    expect(herdr.cmd).not.toHaveBeenCalled();
  });
});

describe('download button', () => {
  const downloads = (changes) => ({ any: true, active: 0, progress: null, open: false, ...changes });
  const button = () => $('downloads');
  const ring = () => $('downloads-ring').getAttribute('stroke-dasharray');
  const placeAt = (id, left) => ($(id).getBoundingClientRect = () => ({ left, bottom: 70, width: 28 }));

  it('shows once there is a download', () => {
    emit('state', makeState());
    expect(button().hidden).toBe(true);
    emit('state', makeState({ downloads: downloads({ any: false }) }));
    expect(button().hidden).toBe(true);
    emit('state', makeState({ downloads: downloads() }));
    expect(button().hidden).toBe(false);
    expect(button().classList.contains('running')).toBe(false);
    expect(button().title).toBe('Downloads (Cmd+Option+L)');
  });

  it('fills the ring as files download, or spins when the size is unknown', () => {
    emit('state', makeState({ downloads: downloads({ active: 1, progress: 0.42 }) }));
    expect(button().classList.contains('running')).toBe(true);
    expect(button().classList.contains('indeterminate')).toBe(false);
    expect(ring()).toBe('42 100');
    expect(button().title).toBe('Downloading 1 file (Cmd+Option+L)');
    // Progress comes on its own message.
    emit('downloads', downloads({ active: 2, progress: null, open: true }));
    expect(button().classList.contains('indeterminate')).toBe(true);
    expect(button().classList.contains('open')).toBe(true);
    expect(ring()).toBe('25 100');
    expect(button().title).toBe('Downloading 2 files (Cmd+Option+L)');
  });

  it('takes progress before any state arrives', () => {
    emit('downloads', downloads({ active: 1, progress: 0.5 }));
    expect(ring()).toBe('50 100');
  });

  it('keeps progress that came on its own when a rename ends', () => {
    emit('state', makeState({ downloads: downloads() }));
    mouse(tabs()[0], 'dblclick');
    emit('downloads', downloads({ active: 1, progress: 0.5 }));
    key(document.querySelector('input.rename'), 'Escape');
    expect(ring()).toBe('50 100');
  });

  it('toggles the panel from the button', () => {
    emit('state', makeState({ downloads: downloads() }));
    click(button());
    expect(herdr.cmd).toHaveBeenLastCalledWith('toggleDownloads', expect.any(Object));
  });

  it('draws the open panel over the page, under the button, kept inside the window', () => {
    emit('state', makeState({ downloads: downloads() }));
    const overlay = $('downloads-overlay');
    expect(overlay.hidden).toBe(true);
    placeAt('downloads', 1300);
    window.innerWidth = 1400;
    emit('downloads', downloads({ open: true }));
    expect(overlay.hidden).toBe(false);
    expect([overlay.style.left, overlay.style.top]).toEqual([`${1328 - 360}px`, '74px']);
    // While there is no button, under settings; never past the window's edges.
    emit('state', makeState({ downloads: downloads({ any: false, open: true }) }));
    placeAt('settings', 0);
    fire(window, new Event('resize'));
    expect(overlay.style.left).toBe('8px');
    emit('downloads', downloads({ open: false }));
    expect(overlay.hidden).toBe(true);
  });

  it('names the other keys elsewhere', () => {
    start('linux');
    emit('state', makeState({ downloads: downloads() }));
    expect(button().title).toBe('Downloads (Ctrl+J)');
  });
});

describe('other platforms', () => {
  it('marks the platform', () => {
    start('linux');
    expect(root().classList.contains('platform-linux')).toBe(true);
    expect(root().classList.contains('platform-darwin')).toBe(false);
  });
});

describe('page views', () => {
  const tags = () => [...document.querySelectorAll('electrobun-webview')];
  const tagOf = (tabId) => document.querySelector(`electrobun-webview[data-tab="${tabId}"]`);
  const ready = async () => {
    await new Promise((resolve) => setTimeout(resolve, 50));
    await flush();
  };

  it('makes a native view for each tab with a page, with the preload, and reports it', async () => {
    emit('state', makeState());
    expect(tags().map((t) => t.dataset.tab)).toEqual(['t1', 't3']);
    const tag = tagOf('t1');
    expect(tag.getAttribute('src')).toBe('https://example.com/');
    expect(tag.hasAttribute('sandbox')).toBe(true);
    expect(tag.getAttribute('renderer')).toBe('native');
    expect(tag.getAttribute('masks')).toBe('#suggestions-overlay,#downloads-overlay');
    expect(tag.getAttribute('preload')).toMatch(/^window\.__herdrKeys=\["ctrl\+t"\];\n/);
    expect(tag.getAttribute('preload')).toContain('__electrobunSendToHost');
    await ready();
    expect(herdr.tabView.mock.calls.map(([tabId]) => tabId)).toEqual(['t1', 't3']);
    // Only the shown tab's view is visible, and it takes the clicks.
    expect(tagOf('t3').toggleHidden).toHaveBeenCalledWith(true);
    expect(tagOf('t3').togglePassthrough).toHaveBeenCalledWith(true);
    expect(tagOf('t1').toggleHidden).not.toHaveBeenCalled();

    emit('state', makeState({ shown: 't3' }));
    expect(tagOf('t1').toggleHidden).toHaveBeenLastCalledWith(true);
    expect(tagOf('t3').toggleHidden).toHaveBeenLastCalledWith(false);
  });

  it('removes the view of a tab that slept or closed, and keeps the others as they are', async () => {
    emit('state', makeState());
    const first = tagOf('t1');
    emit('state', makeState({ pages: [{ id: 't1', src: 'https://elsewhere.example/' }] }));
    expect(tags()).toEqual([first]);
    expect(first.getAttribute('src')).toBe('https://example.com/');
    emit('state', makeState({ pages: undefined, shown: null }));
    expect(tags()).toEqual([]);
    await ready();
    expect(herdr.tabView).not.toHaveBeenCalled();
  });

  it('asks the shown view whether it can go back or forward as it navigates', async () => {
    webviewTags.nav = { canGoBack: true, canGoForward: false };
    emit('state', makeState());
    await ready();
    expect($('back').disabled).toBe(false);
    webviewTags.nav = { canGoBack: false, canGoForward: true };
    tagOf('t1').fire('did-navigate', 'https://example.com/next');
    await flush();
    expect([$('back').disabled, $('forward').disabled]).toEqual([true, false]);
    // A hidden tab's navigation doesn't count.
    webviewTags.nav = { canGoBack: true, canGoForward: true };
    tagOf('t3').fire('did-navigate-in-page', 'https://docs.example/#x');
    await flush();
    expect($('back').disabled).toBe(true);
    emit('state', makeState({ shown: 'gone' }));
    expect($('forward').disabled).toBe(true);
  });

  it('shows a blank tab see-through, until it goes somewhere', async () => {
    emit('state', makeState({ pages: [{ id: 't2', src: 'about:blank' }], shown: 't2' }));
    const tag = tagOf('t2');
    expect(tag.hasAttribute('transparent')).toBe(true);
    tag.fire('did-navigate', 'https://example.com/');
    expect(tag.toggleTransparent).toHaveBeenLastCalledWith(false);
    tag.fire('did-navigate', 'https://example.com/b');
    expect(tag.toggleTransparent).toHaveBeenCalledTimes(1);
    tag.fire('did-navigate', 'about:blank');
    expect(tag.toggleTransparent).toHaveBeenLastCalledWith(true);
  });

  it('goes back, forward and reloads when main asks, and nothing else', () => {
    emit('state', makeState());
    emit('page-action', { tabId: 't1', action: 'goBack' });
    emit('page-action', { tabId: 't1', action: 'reload' });
    emit('page-action', { tabId: 't1', action: 'remove' });
    emit('page-action', { tabId: 'nope', action: 'goBack' });
    expect(tagOf('t1').goBack).toHaveBeenCalled();
    expect(tagOf('t1').reload).toHaveBeenCalled();
    expect(tags()).toHaveLength(2);
  });

  it('cuts the holes again when an overlay opens or closes', () => {
    emit('state', makeState());
    emit('suggest-overlay', { x: 10.4, y: 70.6, width: 300, height: 74 });
    const overlay = $('suggestions-overlay');
    expect(overlay.hidden).toBe(false);
    expect([overlay.style.left, overlay.style.top, overlay.style.width, overlay.style.height]).toEqual(['10px', '71px', '300px', '74px']);
    expect(tagOf('t1').syncDimensions).toHaveBeenCalledWith(true);
    emit('suggest-overlay', null);
    expect(overlay.hidden).toBe(true);
  });
});
