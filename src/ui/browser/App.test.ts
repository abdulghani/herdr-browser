// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/svelte';
import { flushSync } from 'svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App.svelte';
import type { HerdrApi } from './preload';
import type { Commands } from '../../ipc';
import type { SuggestionsPayload } from '../../services/history/suggestions';
import type { DownloadsSummary, Suggestion, UiState } from '../../types';

// The messages main sends, and what each one carries (as HerdrApi.on takes them).
type Channel = Parameters<HerdrApi['on']>[0];
type Payload<C extends Channel> = Parameters<Parameters<typeof window.herdr.on<C>>[1]>[0];
type Listener = (payload?: unknown) => void;

function fakeHerdr(platform: NodeJS.Platform) {
  return {
    platform,
    // Not generic like HerdrApi's, so its calls read as [name, arg].
    cmd: vi.fn((_name: keyof Commands, _arg?: unknown) => {}),
    ready: vi.fn<HerdrApi['ready']>(),
    suggest: vi.fn<HerdrApi['suggest']>(async () => []),
    on: vi.fn<HerdrApi['on']>((channel, fn) => {
      listeners[channel] = fn as Listener;
    }),
  };
}

let herdr: ReturnType<typeof fakeHerdr>;
let listeners: Partial<Record<Channel, Listener>>;
const $ = (id: string) => document.getElementById(id)!;
const $input = (id: string) => $(id) as HTMLInputElement;
const $button = (id: string) => $(id) as HTMLButtonElement;
const flush = async () => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
  flushSync();
};

function start(platform: NodeJS.Platform = 'darwin') {
  cleanup();
  listeners = {};
  herdr = fakeHerdr(platform);
  window.herdr = herdr;
  render(App);
}

const noDownloads: DownloadsSummary = { any: false, active: 0, progress: null, open: false };

function makeState(changes: Partial<UiState> = {}): UiState {
  return {
    workspaces: [
      {
        id: 'w1',
        name: 'claims migration',
        activeTab: 0,
        tabs: [
          { id: 't1', title: 'Example', url: 'https://example.com/', favicon: 'https://example.com/favicon.ico' },
          { id: 't2', title: '', url: 'about:blank', favicon: null },
        ],
      },
      {
        id: 'w2',
        name: 'research',
        activeTab: 0,
        tabs: [{ id: 't3', title: 'Docs', customName: 'My docs', url: 'https://docs.example/', favicon: null }],
      },
      { id: 'w3', name: '  ', activeTab: 0, tabs: [{ id: 't4', title: 'Four', url: 'https://four.example/', favicon: null }] },
    ],
    activeWs: 0,
    awake: ['t1', 't3'],
    sidebarCollapsed: false,
    nav: { canGoBack: true, canGoForward: false, loading: false },
    prefixArmed: false,
    find: null,
    downloads: noDownloads,
    ...changes,
  };
}

// Same state with another active tab in the first workspace.
const onTab = (activeTab: number, changes?: Partial<UiState>) => {
  const s = makeState(changes);
  s.workspaces[0].activeTab = activeTab;
  return s;
};

// Run something, then let Svelte update the page.
const act = <T>(fn: () => T) => {
  const result = fn();
  flushSync();
  return result;
};
function emit<C extends Channel>(channel: C, ...payload: Payload<C> extends void ? [] : [Payload<C>]) {
  act(() => listeners[channel]!(payload[0]));
}
const click = (target: HTMLElement) => act(() => target.click());
const fire = <E extends Event>(target: EventTarget, event: E) => {
  act(() => target.dispatchEvent(event));
  return event;
};
const mouse = (target: EventTarget, type: string, extra: MouseEventInit = {}) =>
  fire(target, new MouseEvent(type, { bubbles: true, cancelable: true, ...extra }));
const typeInto = (input: HTMLInputElement, value: string) => {
  input.value = value;
  fire(input, new Event('input', { bubbles: true }));
};
const key = (target: EventTarget, k: string, extra: KeyboardEventInit = {}) =>
  fire(target, new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...extra }));
// The first element in `parent` that matches, which the test knows is there.
const find = (parent: ParentNode, selector: string) => parent.querySelector<HTMLElement>(selector)!;
const root = () => $('app');
const workspaces = () => [...document.querySelectorAll<HTMLElement>('#workspaces li.ws')];
const tabs = () => [...document.querySelectorAll<HTMLElement>('#tabs li')];
const commands = () => herdr.cmd.mock.calls;

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
  vi.stubGlobal('requestAnimationFrame', (fn: () => void) => fn());
  start();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
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
    expect(items.map((li) => find(li, '.ws-name').textContent)).toEqual(['claims migration', 'research', '  ']);
    expect(items.map((li) => find(li, '.ws-num').textContent)).toEqual(['1', '2', '3']);
    expect(items.map((li) => find(li, '.ws-count').textContent)).toEqual(['2', '1', '1']);
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
    expect(items.map((li) => find(li, '.tab-title').textContent)).toEqual(['Example', 'about:blank']);
    expect(items.map((li) => ['active', 'asleep'].filter((c) => li.classList.contains(c)))).toEqual([['active'], ['asleep']]);
    expect(items.map((li) => find(li, '.tab-num').textContent)).toEqual(['1', '2']);
    expect(items[0].title).toBe('Example\nhttps://example.com/');
    expect(find(items[0], 'img').getAttribute('src')).toBe('https://example.com/favicon.ico');
    // A tab that isn't loaded shows its icon in the dashed ring.
    expect(find(items[1], '.favicon-blank').classList.contains('sleeping-ring')).toBe(true);
    expect(find(items[0], 'img').classList.contains('sleeping-ring')).toBe(false);
    expect(Element.prototype.scrollIntoView).toHaveBeenCalledWith({ block: 'nearest', inline: 'nearest' });
  });

  it('uses a custom tab name', () => {
    emit('state', makeState({ activeWs: 1 }));
    expect(find(tabs()[0], '.tab-title').textContent).toBe('My docs');
  });

  it('swaps a broken favicon for a blank one', () => {
    fire(find(tabs()[0], 'img'), new Event('error'));
    expect(tabs()[0].querySelector('img')).toBeNull();
    expect(tabs()[0].querySelector('.favicon-blank')).not.toBeNull();
  });

  it('shows the toolbar state', () => {
    expect($button('back').disabled).toBe(false);
    expect($button('forward').disabled).toBe(true);
    expect($('reload').textContent).toBe('↻');
    expect($('reload').title).toBe('Reload (Ctrl+R)');
    expect($('prefix').hidden).toBe(true);
    expect($input('address').value).toBe('https://example.com/');
    expect($('collapse').textContent).toBe('«');
    expect($('collapse').title).toBe('Collapse sidebar (Ctrl+B)');
    expect(root().classList.contains('collapsed')).toBe(false);
    expect($('notice').hidden).toBe(true);
    expect($('find').hidden).toBe(true);
  });

  it('shows loading, the armed prefix and a collapsed sidebar', () => {
    emit('state', makeState({ nav: { canGoBack: false, canGoForward: true, loading: true }, prefixArmed: true, sidebarCollapsed: true }));
    expect($button('back').disabled).toBe(true);
    expect($button('forward').disabled).toBe(false);
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
    expect(items.map((li) => find(li, '.ws-icon').firstChild!.textContent)).toEqual(['CM', 'RE', '?']);
    expect(items.map((li) => find(li, '.ws-badge').textContent)).toEqual(['1', '2', '3']);
    expect(items[0].querySelector('.ws-name')).toBeNull();
    expect($('new-ws')).toBeNull();
    expect($('help')).toBeNull();
    click(find(document, '#workspaces .ws-add'));
    expect(herdr.cmd).toHaveBeenLastCalledWith('newWorkspace');
  });

  it('leaves the address bar empty on a blank page', () => {
    emit('state', onTab(1));
    expect($input('address').value).toBe('');
  });

  it("doesn't overwrite what is typed in the address bar, unless the tab changes", () => {
    $input('address').focus();
    typeInto($input('address'), 'typing');
    emit('state', makeState());
    expect($input('address').value).toBe('typing');
    emit('state', onTab(1));
    expect($input('address').value).toBe('');
  });

  it('follows a link clicked in the page, even though the address bar is still the focused element', () => {
    $input('address').focus();
    typeInto($input('address'), 'typing');
    // Clicking the page moves focus to the page's view, out of this document.
    vi.spyOn(document, 'hasFocus').mockReturnValue(false);
    const s = makeState();
    s.workspaces[0].tabs[0].url = 'https://example.com/next';
    emit('state', s);
    expect($input('address').value).toBe('https://example.com/next');
  });
});

describe('macOS title bar', () => {
  it('makes the empty top bars drag the window, but not what is clickable in them', () => {
    emit('state', makeState());
    expect(find(document, '#sidebar header').classList.contains('app-drag')).toBe(true);
    expect($('tabstrip').classList.contains('app-drag')).toBe(true);
    for (const el of [$('new-ws'), $('collapse'), $('new-tab'), tabs()[0]]) expect(el.classList.contains('app-no-drag')).toBe(true);
    // Room for the window buttons.
    expect(find(document, '#sidebar header').classList.contains('pl-20')).toBe(true);
    emit('state', makeState({ sidebarCollapsed: true }));
    expect(find(document, '#sidebar header').classList.contains('pt-tabstrip')).toBe(true);
    expect($('tabstrip').classList.contains('pl-7')).toBe(true);
  });

  it('leaves no room for window buttons elsewhere', () => {
    start('linux');
    emit('state', makeState({ sidebarCollapsed: true }));
    expect(find(document, '#sidebar header').classList.contains('pt-tabstrip')).toBe(false);
    expect($('tabstrip').classList.contains('pl-7')).toBe(false);
    emit('state', makeState());
    expect(find(document, '#sidebar header').classList.contains('pl-20')).toBe(false);
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
    expect($input('find-input').value).toBe('cat');
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
    expect(document.activeElement).toBe($input('find-input'));
    typeInto($input('find-input'), 'cat');
    emit('state', makeState({ find: { text: 'ca', active: 1, total: 1 } }));
    expect($input('find-input').value).toBe('cat');
    emit('state', onTab(1, { find: { text: 'dog', active: 0, total: 0 } }));
    expect($input('find-input').value).toBe('dog');
  });

  it('sends what is typed and the find keys', () => {
    emit('state', makeState({ find: { text: '', active: 0, total: 0 } }));
    const input = $input('find-input');
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
    click(find(workspaces()[1], '.close'));
    expect(commands()).toEqual([['closeWorkspace', 'w2']]);
  });

  it('selects and closes tabs, also with a middle click', () => {
    click(tabs()[1]);
    expect(herdr.cmd).toHaveBeenLastCalledWith('selectTab', 't2');
    herdr.cmd.mockClear();
    click(find(tabs()[1], '.close'));
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
    const address = $input('address');
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
    const address = $input('address');
    expect(document.activeElement).toBe(address);
    expect([address.selectionStart, address.selectionEnd]).toEqual([0, address.value.length]);
  });

  it('Escape returns to the page', () => {
    const address = $input('address');
    address.focus();
    key(address, 'Escape');
    expect(herdr.cmd).toHaveBeenLastCalledWith('focusContent');
  });

  it('ignores Enter and arrows with no suggestions open', () => {
    const address = $input('address');
    address.focus();
    expect(key(address, 'Enter').defaultPrevented).toBe(false);
    expect(key(address, 'ArrowDown').defaultPrevented).toBe(false);
    expect(commands()).toEqual([]);
  });
});

describe('address bar suggestions', () => {
  const match = { favicon: null, highlight: { title: [], url: [] }, rank: 0 };
  const history: Suggestion = { kind: 'history', title: 'GitHub', displayUrl: 'github.com', url: 'https://github.com/', ...match };
  const tab: Suggestion = { kind: 'tab', title: 'Docs', displayUrl: 'docs.example', tabId: 't3', url: 'https://docs.example/', ...match };
  // The showSuggestions commands, with what each one showed.
  const shown = () => commands().filter(([name]) => name === 'showSuggestions') as ['showSuggestions', SuggestionsPayload][];

  async function type(text: string, matches = [history, tab]) {
    herdr.suggest.mockResolvedValueOnce(matches);
    typeInto($input('address'), text);
    await flush();
  }

  beforeEach(() => {
    emit('state', makeState());
    $input('address').focus();
    herdr.cmd.mockClear();
  });

  it("doesn't list on focus for a page that is open", () => {
    expect(herdr.suggest).not.toHaveBeenCalled();
  });

  it('lists recent pages on focus in a blank tab', async () => {
    $input('address').blur();
    emit('state', onTab(1));
    herdr.suggest.mockResolvedValueOnce([history]);
    $input('address').focus();
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
    expect(shown().at(-1)![1].rows).toEqual([{ kind: 'typed', query: 'git' }, history, tab]);
  });

  it('drops results that a newer keystroke replaced', async () => {
    let slow!: (rows: Suggestion[]) => void;
    herdr.suggest.mockReturnValueOnce(new Promise((resolve) => (slow = resolve)));
    typeInto($input('address'), 'g');
    await type('gi');
    slow([tab]);
    await flush();
    expect(shown()).toHaveLength(1);
    expect(shown()[0][1].rows[0]).toEqual({ kind: 'typed', query: 'gi' });
  });

  it('drops results that arrive after focus left', async () => {
    let slow!: (rows: Suggestion[]) => void;
    herdr.suggest.mockReturnValueOnce(new Promise((resolve) => (slow = resolve)));
    typeInto($input('address'), 'g');
    $input('address').blur();
    slow([tab]);
    await flush();
    expect(shown()).toHaveLength(0);
  });

  it('closes when typing without focus', async () => {
    await type('git');
    $input('address').blur();
    typeInto($input('address'), 'gitx');
    expect(herdr.cmd).toHaveBeenLastCalledWith('hideSuggestions');
  });

  it('moves the selection with the arrows, wrapping around', async () => {
    await type('git');
    const address = $input('address');
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
    expect(key($input('address'), 'Enter').defaultPrevented).toBe(true);
    expect(commands().slice(-2)).toEqual([['navigate', 'git'], ['hideSuggestions']]);
    expect(document.activeElement).not.toBe($input('address'));
  });

  it('Enter opens the selected page', async () => {
    await type('git');
    key($input('address'), 'ArrowDown');
    key($input('address'), 'Enter');
    expect(herdr.cmd).toHaveBeenCalledWith('navigate', 'https://github.com/');
  });

  it('Enter switches to the selected tab, also after a hover', async () => {
    await type('git');
    emit('suggest-hover', 2);
    key($input('address'), 'Enter');
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
    key($input('address'), 'Escape');
    expect(herdr.cmd).toHaveBeenLastCalledWith('hideSuggestions');
    expect($input('address').value).toBe('git');
    expect(document.activeElement).toBe($input('address'));
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
    $input('address').blur();
    $input('address').focus();
    vi.advanceTimersByTime(200);
    expect(herdr.cmd).not.toHaveBeenCalledWith('hideSuggestions');
    $input('address').blur();
    vi.advanceTimersByTime(100);
    expect(herdr.cmd).not.toHaveBeenCalledWith('hideSuggestions');
    vi.advanceTimersByTime(100);
    expect(herdr.cmd).toHaveBeenLastCalledWith('hideSuggestions');
  });
});

describe('inline rename', () => {
  beforeEach(() => emit('state', makeState()));
  const renameInput = () => document.querySelector<HTMLInputElement>('input.rename');

  it('renames a tab on double click', () => {
    mouse(tabs()[0], 'dblclick');
    const input = renameInput()!;
    expect(input.parentElement!.classList.contains('tab-title')).toBe(true);
    expect(input.value).toBe('Example');
    expect(document.activeElement).toBe(input);
    expect([input.selectionStart, input.selectionEnd]).toEqual([0, 7]);
    // Clicks in the input don't select or rename the tab again.
    click(input);
    mouse(input, 'dblclick');
    expect(commands()).toEqual([]);
    // State updates wait until the rename is done.
    emit('state', makeState({ nav: { canGoBack: false, canGoForward: false, loading: false } }));
    expect(renameInput()).toBe(input);
    expect($button('back').disabled).toBe(false);

    input.value = 'Mine';
    key(input, 'Enter');
    expect(commands()).toEqual([['renameTab', { id: 't1', name: 'Mine' }], ['focusContent']]);
    expect(renameInput()).toBeNull();
    // Then the newest state shows.
    expect($button('back').disabled).toBe(true);
    fire(input, new FocusEvent('blur'));
    expect(commands()).toHaveLength(2);
  });

  it('cancels on Escape', () => {
    mouse(tabs()[0], 'dblclick');
    key(renameInput()!, 'x');
    key(renameInput()!, 'Escape');
    expect(commands()).toEqual([['focusContent']]);
    expect(find(tabs()[0], '.tab-title').textContent).toBe('Example');
  });

  it('saves when focus leaves', () => {
    emit('rename', { kind: 'tab', id: 't2' });
    const input = renameInput()!;
    input.value = 'Blank';
    act(() => input.blur());
    expect(herdr.cmd).toHaveBeenCalledWith('renameTab', { id: 't2', name: 'Blank' });
  });

  it('renames a workspace on double click', () => {
    mouse(workspaces()[1], 'dblclick');
    const input = renameInput()!;
    expect(input.parentElement!.classList.contains('ws-name')).toBe(true);
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
    const input = renameInput()!;
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

  // jsdom has no DragEvent; a plain event with an empty dataTransfer is enough for the UI.
  const drag = (target: EventTarget, type: string) => {
    const e = Object.assign(new Event(type, { cancelable: true, bubbles: true }), { dataTransfer: {} as DataTransfer });
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
  const downloads = (changes: Partial<DownloadsSummary> = {}): DownloadsSummary => ({
    any: true,
    active: 0,
    progress: null,
    open: false,
    ...changes,
  });
  const button = () => $('downloads');
  const ring = () => $('downloads-ring').getAttribute('stroke-dasharray');
  // The UI only reads left, bottom and width.
  const placeAt = (id: string, left: number) => ($(id).getBoundingClientRect = () => ({ left, bottom: 70, width: 28 }) as DOMRect);

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
    key(find(document, 'input.rename'), 'Escape');
    expect(ring()).toBe('50 100');
  });

  it('toggles the panel under the button', () => {
    emit('state', makeState({ downloads: downloads() }));
    placeAt('downloads', 1300);
    click(button());
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
    fire(window, new Event('resize'));
    emit('state', makeState({ downloads: downloads() }));
    fire(window, new Event('resize'));
    expect(herdr.cmd).not.toHaveBeenCalled();
    emit('downloads', downloads({ open: true }));
    fire(window, new Event('resize'));
    expect(herdr.cmd).toHaveBeenLastCalledWith('showDownloads', expect.any(Object));
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
