// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadBody } from '../../testing/dom.js';

let herdr;
let listeners;
const $ = (id) => document.getElementById(id);
const flush = async () => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
};

async function start(platform = 'darwin') {
  loadBody('src/ui/browser/index.html');
  listeners = {};
  herdr = {
    platform,
    cmd: vi.fn(),
    ready: vi.fn(),
    suggest: vi.fn(async () => []),
    on: vi.fn((channel, fn) => (listeners[channel] = fn)),
  };
  window.herdr = herdr;
  vi.resetModules();
  await import('./renderer.js');
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
    sidebarCollapsed: false,
    nav: { canGoBack: true, canGoForward: false, loading: false },
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

const emit = (channel, payload) => listeners[channel](payload);
const workspaces = () => [...document.querySelectorAll('#workspaces li.ws')];
const tabs = () => [...document.querySelectorAll('#tabs li')];
const commands = () => herdr.cmd.mock.calls;
const key = (target, k, extra = {}) => {
  const e = new KeyboardEvent('keydown', { key: k, cancelable: true, ...extra });
  target.dispatchEvent(e);
  return e;
};

beforeEach(async () => {
  Element.prototype.scrollIntoView = vi.fn();
  vi.stubGlobal('requestAnimationFrame', (fn) => fn());
  await start();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('start up', () => {
  it('tells main it is ready and marks the platform', () => {
    expect(herdr.ready).toHaveBeenCalled();
    expect(document.body.classList.contains('platform-darwin')).toBe(true);
  });

  it('stops or reloads before any state arrives', () => {
    $('reload').click();
    expect(herdr.cmd).toHaveBeenCalledWith('reload');
  });
});

describe('rendering state', () => {
  beforeEach(() => emit('state', makeState()));

  it('lists the workspaces', () => {
    const items = workspaces();
    expect(items.map((li) => li.querySelector('.ws-name').textContent)).toEqual(['claims migration', 'research', '  ']);
    expect(items.map((li) => li.querySelector('.ws-icon').firstChild.textContent)).toEqual(['CM', 'RE', '?']);
    expect(items.map((li) => li.querySelector('.ws-count').textContent)).toEqual(['2', '1', '1']);
    expect(items.map((li) => li.classList.contains('active'))).toEqual([true, false, false]);
    expect(items[0].title).toBe('claims migration (2 tabs)\n  Example\n  about:blank');
    expect(items[1].dataset.id).toBe('w2');
    expect(document.querySelector('#workspaces .ws-add')).not.toBeNull();
  });

  it('lists the tabs of the active workspace', () => {
    const items = tabs();
    expect(items.map((li) => li.querySelector('.tab-title').textContent)).toEqual(['Example', 'about:blank']);
    expect(items.map((li) => li.className)).toEqual(['tab active', 'tab asleep']);
    expect(items[0].title).toBe('Example\nhttps://example.com/');
    expect(items[0].querySelector('img').getAttribute('src')).toBe('https://example.com/favicon.ico');
    expect(items[1].querySelector('.favicon-blank')).not.toBeNull();
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
  });

  it('uses a custom tab name', () => {
    emit('state', makeState({ activeWs: 1 }));
    expect(tabs()[0].querySelector('.tab-title').textContent).toBe('My docs');
  });

  it('swaps a broken favicon for a blank one', () => {
    tabs()[0].querySelector('img').dispatchEvent(new Event('error'));
    expect(tabs()[0].querySelector('img')).toBeNull();
    expect(tabs()[0].querySelector('.favicon-blank')).not.toBeNull();
  });

  it('shows the toolbar state', () => {
    expect($('back').disabled).toBe(false);
    expect($('forward').disabled).toBe(true);
    expect($('reload').textContent).toBe('↻');
    expect($('reload').title).toBe('Reload (Ctrl+R)');
    expect($('prefix').hidden).toBe(true);
    expect($('address').value).toBe('https://example.com/');
    expect($('collapse').textContent).toBe('«');
    expect($('collapse').title).toBe('Collapse sidebar (Ctrl+B)');
    expect(document.body.classList.contains('collapsed')).toBe(false);
    expect($('notice').hidden).toBe(true);
    expect($('find').hidden).toBe(true);
  });

  it('shows loading, the armed prefix and a collapsed sidebar', () => {
    emit('state', makeState({ nav: { canGoBack: false, canGoForward: true, loading: true }, prefixArmed: true, sidebarCollapsed: true }));
    expect($('back').disabled).toBe(true);
    expect($('forward').disabled).toBe(false);
    expect($('reload').textContent).toBe('×');
    expect($('reload').title).toBe('Stop');
    expect($('prefix').hidden).toBe(false);
    expect(document.body.classList.contains('collapsed')).toBe(true);
    expect($('collapse').textContent).toBe('»');
    expect($('collapse').title).toBe('Expand sidebar (Ctrl+B)');
    $('reload').click();
    expect(herdr.cmd).toHaveBeenLastCalledWith('stop');
  });

  it('leaves the address bar empty on a blank page', () => {
    emit('state', onTab(1));
    expect($('address').value).toBe('');
  });

  it("doesn't overwrite what is typed in the address bar, unless the tab changes", () => {
    $('address').focus();
    $('address').value = 'typing';
    emit('state', makeState());
    expect($('address').value).toBe('typing');
    emit('state', onTab(1));
    expect($('address').value).toBe('');
  });
});

describe('notice bar', () => {
  it('offers to open the page in another browser', () => {
    const s = makeState();
    s.workspaces[0].tabs[0].notice = { kind: 'passkey', browser: 'Chrome' };
    emit('state', s);
    expect($('notice').hidden).toBe(false);
    expect($('notice-text').textContent).toBe("This site wants a passkey, which doesn't work here yet.");
    expect($('notice-text').title).toMatch(/no passkey support/);
    expect($('notice-open').hidden).toBe(false);
    expect($('notice-open').textContent).toBe('Open in Chrome');
  });

  it('hides the open button when there is no other browser', () => {
    const s = makeState();
    s.workspaces[0].tabs[0].notice = { kind: 'passkey', browser: null };
    emit('state', s);
    expect($('notice').hidden).toBe(false);
    expect($('notice-open').hidden).toBe(true);
  });
});

describe('find bar', () => {
  it('shows the search and match count', () => {
    emit('state', makeState({ find: { text: 'cat', active: 2, total: 5 } }));
    expect($('find').hidden).toBe(false);
    expect($('find-input').value).toBe('cat');
    expect($('find-count').textContent).toBe('2/5');
    expect($('find-count').classList.contains('none')).toBe(false);
  });

  it('marks no matches, and shows no count for an empty search', () => {
    emit('state', makeState({ find: { text: 'zzz', active: 0, total: 0 } }));
    expect($('find-count').textContent).toBe('0/0');
    expect($('find-count').classList.contains('none')).toBe(true);
    emit('state', makeState({ find: { text: '', active: 0, total: 0 } }));
    expect($('find-count').textContent).toBe('');
    expect($('find-count').classList.contains('none')).toBe(false);
  });

  it("doesn't overwrite what is typed, unless the tab changes", () => {
    emit('state', makeState({ find: { text: 'ca', active: 0, total: 0 } }));
    emit('focus-find');
    expect(document.activeElement).toBe($('find-input'));
    $('find-input').value = 'cat';
    emit('state', makeState({ find: { text: 'ca', active: 1, total: 1 } }));
    expect($('find-input').value).toBe('cat');
    emit('state', onTab(1, { find: { text: 'dog', active: 0, total: 0 } }));
    expect($('find-input').value).toBe('dog');
  });

  it('sends what is typed and the find keys', () => {
    emit('state', makeState({ find: { text: '', active: 0, total: 0 } }));
    const input = $('find-input');
    input.value = 'cat';
    input.dispatchEvent(new Event('input'));
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
  beforeEach(() => emit('state', makeState({ nav: { canGoBack: true, canGoForward: true, loading: false } })));

  it.each([
    ['new-ws', 'newWorkspace'],
    ['new-tab', 'newTab'],
    ['back', 'back'],
    ['forward', 'forward'],
    ['reload', 'reload'],
    ['sidebar-toggle', 'toggleSidebar'],
    ['settings', 'openSettings'],
    ['collapse', 'toggleSidebar'],
    ['notice-open', 'openExternally'],
    ['notice-dismiss', 'dismissNotice'],
    ['find-close', 'closeFind'],
  ])('%s sends %s', (id, name) => {
    $(id).click();
    expect(herdr.cmd).toHaveBeenLastCalledWith(name);
  });

  it('find arrows go to the previous and next match', () => {
    $('find-prev').click();
    expect(herdr.cmd).toHaveBeenLastCalledWith('findNext', false);
    $('find-next').click();
    expect(herdr.cmd).toHaveBeenLastCalledWith('findNext', true);
  });

  it('selects and closes workspaces', () => {
    workspaces()[1].click();
    expect(herdr.cmd).toHaveBeenLastCalledWith('selectWorkspace', 'w2');
    herdr.cmd.mockClear();
    workspaces()[1].querySelector('.close').click();
    expect(commands()).toEqual([['closeWorkspace', 'w2']]);
    document.querySelector('#workspaces .ws-add').click();
    expect(herdr.cmd).toHaveBeenLastCalledWith('newWorkspace');
  });

  it('selects and closes tabs, also with a middle click', () => {
    tabs()[1].click();
    expect(herdr.cmd).toHaveBeenLastCalledWith('selectTab', 't2');
    herdr.cmd.mockClear();
    tabs()[1].querySelector('.close').click();
    expect(commands()).toEqual([['closeTab', 't2']]);
    tabs()[0].dispatchEvent(new MouseEvent('auxclick', { button: 1 }));
    expect(herdr.cmd).toHaveBeenLastCalledWith('closeTab', 't1');
    herdr.cmd.mockClear();
    tabs()[0].dispatchEvent(new MouseEvent('auxclick', { button: 2 }));
    expect(herdr.cmd).not.toHaveBeenCalled();
  });

  it('opens a tab on a double click in the empty tab strip', () => {
    $('tabstrip').dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    expect(herdr.cmd).toHaveBeenLastCalledWith('newTab');
    $('tabs').dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    expect(commands()).toEqual([['newTab'], ['newTab']]);
    $('new-tab').dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    expect(commands()).toHaveLength(2);
  });

  it('toggles the key help', () => {
    expect($('help').hidden).toBe(true);
    $('help-toggle').click();
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
    address.value = 'example.org';
    const e = new Event('submit', { cancelable: true });
    $('address-form').dispatchEvent(e);
    expect(e.defaultPrevented).toBe(true);
    expect(herdr.cmd).toHaveBeenCalledWith('navigate', 'example.org');
    expect(document.activeElement).not.toBe(address);
  });

  it('focuses on request', () => {
    emit('focus-address');
    expect(document.activeElement).toBe($('address'));
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
    $('address').value = text;
    $('address').dispatchEvent(new Event('input'));
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
    $('address').value = 'g';
    $('address').dispatchEvent(new Event('input'));
    await type('gi');
    slow([tab]);
    await flush();
    expect(shown()).toHaveLength(1);
    expect(shown()[0][1].rows[0]).toEqual({ kind: 'typed', query: 'gi' });
  });

  it('drops results that arrive after focus left', async () => {
    let slow;
    herdr.suggest.mockReturnValueOnce(new Promise((resolve) => (slow = resolve)));
    $('address').value = 'g';
    $('address').dispatchEvent(new Event('input'));
    $('address').blur();
    slow([tab]);
    await flush();
    expect(shown()).toHaveLength(0);
  });

  it('closes when typing without focus', async () => {
    await type('git');
    $('address').blur();
    $('address').dispatchEvent(new Event('input'));
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
    window.dispatchEvent(new Event('resize'));
    expect(shown()).toHaveLength(0);
    await type('git');
    window.dispatchEvent(new Event('resize'));
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
    tabs()[0].dispatchEvent(new MouseEvent('dblclick'));
    const input = renameInput();
    expect(input.parentElement.className).toBe('tab-title');
    expect(input.value).toBe('Example');
    expect(document.activeElement).toBe(input);
    // Clicks in the input don't select or rename the tab again.
    input.click();
    input.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    expect(commands()).toEqual([]);
    // State updates wait until the rename is done.
    emit('state', makeState());
    expect(renameInput()).toBe(input);

    input.value = 'Mine';
    key(input, 'Enter');
    expect(commands()).toEqual([['renameTab', { id: 't1', name: 'Mine' }], ['focusContent']]);
    expect(renameInput()).toBeNull();
    input.dispatchEvent(new FocusEvent('blur'));
    expect(commands()).toHaveLength(2);
  });

  it('cancels on Escape', () => {
    tabs()[0].dispatchEvent(new MouseEvent('dblclick'));
    key(renameInput(), 'x');
    key(renameInput(), 'Escape');
    expect(commands()).toEqual([['focusContent']]);
    expect(tabs()[0].querySelector('.tab-title').textContent).toBe('Example');
  });

  it('saves when focus leaves', () => {
    emit('rename', { kind: 'tab', id: 't2' });
    const input = renameInput();
    input.value = 'Blank';
    input.blur();
    expect(herdr.cmd).toHaveBeenCalledWith('renameTab', { id: 't2', name: 'Blank' });
  });

  it('renames a workspace on double click', () => {
    workspaces()[1].dispatchEvent(new MouseEvent('dblclick'));
    const input = renameInput();
    expect(input.parentElement.className).toBe('ws-name');
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

  it('ignores a rename of something that is gone', () => {
    emit('rename', { kind: 'tab', id: 'nope' });
    expect(renameInput()).toBeNull();
  });
});

describe('rename before any state', () => {
  it('does nothing', () => {
    emit('rename', { kind: 'workspace', id: 'w1' });
    expect(document.querySelector('input.rename')).toBeNull();
    expect(herdr.cmd).not.toHaveBeenCalled();
  });
});

describe('drag and drop', () => {
  beforeEach(() => emit('state', makeState()));

  const fire = (target, type) => {
    const e = new Event(type, { cancelable: true, bubbles: true });
    e.dataTransfer = {};
    target.dispatchEvent(e);
    return e;
  };

  it('moves a tab before another tab', () => {
    const [first, second] = tabs();
    const start = fire(first, 'dragstart');
    expect(start.dataTransfer.effectAllowed).toBe('move');
    expect(first.classList.contains('dragging')).toBe(true);
    expect(fire(second, 'dragover').defaultPrevented).toBe(true);
    expect(second.classList.contains('drop-before')).toBe(true);
    fire(second, 'dragleave');
    expect(second.classList.contains('drop-before')).toBe(false);
    fire(second, 'dragover');
    expect(fire(second, 'drop').defaultPrevented).toBe(true);
    expect(herdr.cmd).toHaveBeenCalledWith('moveTabTo', { tabId: 't1', wsId: 'w1', index: 1 });
    fire(first, 'dragend');
    expect(document.querySelectorAll('.dragging, .drop-before, .drop-into')).toHaveLength(0);
  });

  it('ignores dropping a tab on itself', () => {
    const [first] = tabs();
    fire(first, 'dragstart');
    expect(fire(first, 'dragover').defaultPrevented).toBe(false);
    fire(first, 'drop');
    expect(herdr.cmd).not.toHaveBeenCalled();
  });

  it('moves a tab into another workspace', () => {
    fire(tabs()[0], 'dragstart');
    const target = workspaces()[1];
    fire(target, 'dragover');
    expect(target.classList.contains('drop-into')).toBe(true);
    fire(target, 'drop');
    expect(herdr.cmd).toHaveBeenCalledWith('moveTabTo', { tabId: 't1', wsId: 'w2' });
  });

  it('reorders workspaces', () => {
    fire(workspaces()[0], 'dragstart');
    const target = workspaces()[2];
    fire(target, 'dragover');
    expect(target.classList.contains('drop-before')).toBe(true);
    fire(target, 'drop');
    expect(herdr.cmd).toHaveBeenCalledWith('moveWorkspaceTo', { wsId: 'w1', index: 2 });
  });

  it("doesn't drop a workspace on a tab", () => {
    fire(workspaces()[1], 'dragstart');
    expect(fire(tabs()[0], 'dragover').defaultPrevented).toBe(false);
    fire(tabs()[0], 'drop');
    expect(herdr.cmd).not.toHaveBeenCalled();
  });

  it('ignores drags that started elsewhere', () => {
    expect(fire(tabs()[0], 'dragover').defaultPrevented).toBe(false);
    fire(workspaces()[0], 'drop');
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

  it('toggles the panel under the button', () => {
    emit('state', makeState({ downloads: downloads() }));
    placeAt('downloads', 1300);
    button().click();
    expect(herdr.cmd).toHaveBeenLastCalledWith('toggleDownloads', { x: 1300, y: 70, width: 28 });
    emit('show-downloads');
    expect(herdr.cmd).toHaveBeenLastCalledWith('showDownloads', { x: 1300, y: 70, width: 28 });
  });

  it('places the panel under settings while there is no button', () => {
    emit('state', makeState());
    placeAt('settings', 1340);
    emit('show-downloads');
    expect(herdr.cmd).toHaveBeenLastCalledWith('showDownloads', { x: 1340, y: 70, width: 28 });
  });

  it('moves the open panel along when the window resizes', () => {
    window.dispatchEvent(new Event('resize'));
    emit('state', makeState({ downloads: downloads() }));
    window.dispatchEvent(new Event('resize'));
    expect(herdr.cmd).not.toHaveBeenCalled();
    emit('downloads', downloads({ open: true }));
    window.dispatchEvent(new Event('resize'));
    expect(herdr.cmd).toHaveBeenLastCalledWith('showDownloads', expect.any(Object));
  });

  it('names the other keys elsewhere', async () => {
    await start('linux');
    emit('state', makeState({ downloads: downloads() }));
    expect(button().title).toBe('Downloads (Ctrl+J)');
  });
});

describe('other platforms', () => {
  it('marks the platform', async () => {
    await start('linux');
    expect(document.body.className).toBe('platform-linux');
  });
});
