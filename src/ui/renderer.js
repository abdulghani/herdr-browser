const $ = (id) => document.getElementById(id);
const cmd = window.herdr.cmd;
document.body.classList.add(`platform-${window.herdr.platform}`);

let state = null;
let renaming = null; // { kind, id } while an inline rename input is open
let lastActiveTabId = null;
let drag = null; // { kind: 'tab' | 'ws', id }
let pendingRename = null; // workspace rename requested while the sidebar is collapsed
let collapseAfterRename = false;

const el = (tag, props = {}, children = []) => {
  const node = Object.assign(document.createElement(tag), props);
  for (const child of children) node.append(child);
  return node;
};

const tabLabel = (tab) => tab.customName || tab.title || tab.url;

// "claims migration" -> "CM", "research" -> "RE"
function initials(name) {
  const words = name.trim().split(/[\s_-]+/).filter(Boolean);
  if (!words.length) return '?';
  const letters = words.length > 1 ? words[0][0] + words[1][0] : words[0].slice(0, 2);
  return letters.toUpperCase();
}

function closeButton(onClick) {
  return el('button', {
    className: 'close',
    textContent: '×',
    title: 'Close',
    onclick: (e) => {
      e.stopPropagation();
      onClick();
    },
  });
}

// ---------- rendering ----------

function render() {
  if (!state || renaming) return;
  document.body.classList.toggle('collapsed', !!state.sidebarCollapsed);
  $('collapse').textContent = state.sidebarCollapsed ? '»' : '«';
  $('collapse').title = state.sidebarCollapsed ? 'Expand sidebar (Ctrl+B)' : 'Collapse sidebar (Ctrl+B)';
  renderWorkspaces();
  renderTabs();
  renderToolbar();
}

function renderWorkspaces() {
  const list = $('workspaces');
  list.replaceChildren(
    ...state.workspaces.map((ws, i) => {
      const item = el('li', { className: `ws${i === state.activeWs ? ' active' : ''}`, draggable: true }, [
        el('span', { className: 'ws-num', textContent: i + 1 }),
        el('span', { className: 'ws-icon', textContent: initials(ws.name) }, [
          el('span', { className: 'ws-badge', textContent: i + 1 }),
        ]),
        el('span', { className: 'ws-name', textContent: ws.name }),
        el('span', { className: 'ws-count', textContent: ws.tabs.length }),
        closeButton(() => cmd('closeWorkspace', ws.id)),
      ]);
      item.dataset.id = ws.id;
      item.onclick = () => cmd('selectWorkspace', ws.id);
      item.ondblclick = () => requestRename('workspace', ws.id);
      item.title = `${ws.name} (${ws.tabs.length} tabs)\n${ws.tabs.map((t) => `  ${tabLabel(t)}`).join('\n')}`;
      wireDrag(item, 'ws', ws.id, (e) => {
        // Tabs dropped on a workspace move into it; workspaces dropped on one reorder.
        if (drag.kind === 'tab') cmd('moveTabTo', { tabId: drag.id, wsId: ws.id });
        else cmd('moveWorkspaceTo', { wsId: drag.id, index: i });
      });
      return item;
    }),
    el('li', { className: 'ws-add', title: 'New workspace', onclick: () => cmd('newWorkspace') }, [el('span', { textContent: '+' })]),
  );
}

function renderTabs() {
  const ws = state.workspaces[state.activeWs];
  const list = $('tabs');
  list.replaceChildren(
    ...ws.tabs.map((tab, i) => {
      const icon = tab.favicon
        ? el('img', { src: tab.favicon, onerror: (e) => e.target.replaceWith(el('span', { className: 'favicon-blank' })) })
        : el('span', { className: 'favicon-blank' });
      const item = el('li', { className: `tab${i === ws.activeTab ? ' active' : ''}${state.awake.includes(tab.id) ? '' : ' asleep'}`, draggable: true, title: `${tabLabel(tab)}\n${tab.url}` }, [
        el('span', { className: 'tab-num', textContent: i + 1 }),
        icon,
        el('span', { className: 'tab-title', textContent: tabLabel(tab) }),
        closeButton(() => cmd('closeTab', tab.id)),
      ]);
      item.dataset.id = tab.id;
      item.onclick = () => cmd('selectTab', tab.id);
      item.onauxclick = (e) => e.button === 1 && cmd('closeTab', tab.id);
      item.ondblclick = () => startRename('tab', tab.id);
      wireDrag(item, 'tab', tab.id, () => {
        if (drag.kind === 'tab') cmd('moveTabTo', { tabId: drag.id, wsId: ws.id, index: i });
      });
      return item;
    }),
  );
  list.querySelector('.active')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}

function renderToolbar() {
  const ws = state.workspaces[state.activeWs];
  const tab = ws.tabs[ws.activeTab];
  $('back').disabled = !state.nav.canGoBack;
  $('forward').disabled = !state.nav.canGoForward;
  $('reload').textContent = state.nav.loading ? '×' : '↻';
  $('reload').title = state.nav.loading ? 'Stop' : 'Reload (Ctrl+R)';
  $('prefix').hidden = !state.prefixArmed;
  renderNotice(tab.notice);
  renderFind(state.find, tab.id);

  const address = $('address');
  // Don't clobber what the user is typing, unless they switched tabs.
  if (document.activeElement !== address || tab.id !== lastActiveTabId) address.value = tab.url === 'about:blank' ? '' : tab.url;
  if (tab.id !== lastActiveTabId) hideSuggestions();
  lastActiveTabId = tab.id;
}

let findTabId = null;
function renderFind(find, tabId) {
  $('find').hidden = !find;
  if (!find) return;
  const input = $('find-input');
  // Don't clobber what the user is typing, unless they switched tabs.
  if (document.activeElement !== input || tabId !== findTabId) input.value = find.text;
  findTabId = tabId;
  $('find-count').textContent = find.text ? `${find.active}/${find.total}` : '';
  $('find-count').classList.toggle('none', !!find.text && !find.total);
}

function renderNotice(notice) {
  $('notice').hidden = !notice;
  if (!notice) return;
  // Only kind so far: a site asked for a passkey, which Electron can't do.
  $('notice-text').textContent = "This site wants a passkey, which doesn't work here yet.";
  $('notice-text').title =
    'Electron, which Herdr Browser runs on, has no passkey support. Use another sign-in option, or open the page in a browser that supports passkeys.';
  $('notice-open').hidden = !notice.browser;
  $('notice-open').textContent = `Open in ${notice.browser}`;
}

// ---------- inline rename ----------

// The rename input doesn't fit in the icon rail, so expand for the rename and collapse again after.
function requestRename(kind, id) {
  if (kind === 'workspace' && state?.sidebarCollapsed) {
    pendingRename = { kind, id };
    collapseAfterRename = true;
    cmd('toggleSidebar');
    return;
  }
  startRename(kind, id);
}

function startRename(kind, id) {
  const selector = kind === 'tab' ? `#tabs [data-id="${id}"] .tab-title` : `#workspaces [data-id="${id}"] .ws-name`;
  const label = document.querySelector(selector);
  if (!label) return;
  renaming = { kind, id };
  const input = el('input', { className: 'rename', value: label.textContent });
  label.replaceChildren(input);
  input.focus();
  input.select();
  input.onclick = (e) => e.stopPropagation();
  input.ondblclick = (e) => e.stopPropagation();

  let done = false;
  const finish = (commit) => {
    if (done) return;
    done = true;
    renaming = null;
    if (commit) cmd(kind === 'tab' ? 'renameTab' : 'renameWorkspace', { id, name: input.value });
    if (collapseAfterRename) {
      collapseAfterRename = false;
      cmd('toggleSidebar');
    }
    render();
    cmd('focusContent');
  };
  input.onkeydown = (e) => {
    if (e.key === 'Enter') finish(true);
    if (e.key === 'Escape') finish(false);
  };
  input.onblur = () => finish(true);
}

// ---------- drag & drop ----------

function wireDrag(item, kind, id, onDrop) {
  item.ondragstart = (e) => {
    drag = { kind, id };
    e.dataTransfer.effectAllowed = 'move';
    item.classList.add('dragging');
  };
  item.ondragend = () => {
    drag = null;
    document.querySelectorAll('.dragging, .drop-before, .drop-into').forEach((n) => n.classList.remove('dragging', 'drop-before', 'drop-into'));
  };
  item.ondragover = (e) => {
    if (!drag || drag.id === id) return;
    if (kind === 'tab' && drag.kind !== 'tab') return;
    e.preventDefault();
    item.classList.add(kind === 'ws' && drag.kind === 'tab' ? 'drop-into' : 'drop-before');
  };
  item.ondragleave = () => item.classList.remove('drop-before', 'drop-into');
  item.ondrop = (e) => {
    e.preventDefault();
    if (drag && drag.id !== id) onDrop(e);
  };
}

// ---------- toolbar wiring ----------

$('new-ws').onclick = () => cmd('newWorkspace');
$('new-tab').onclick = () => cmd('newTab');
$('back').onclick = () => cmd('back');
$('forward').onclick = () => cmd('forward');
$('reload').onclick = () => cmd(state?.nav.loading ? 'stop' : 'reload');
$('sidebar-toggle').onclick = () => cmd('toggleSidebar');
$('collapse').onclick = () => cmd('toggleSidebar');
$('notice-open').onclick = () => cmd('openExternally');
$('notice-dismiss').onclick = () => cmd('dismissNotice');
$('help-toggle').onclick = () => ($('help').hidden = !$('help').hidden);
$('tabstrip').ondblclick = (e) => e.target.id === 'tabs' || e.target.id === 'tabstrip' ? cmd('newTab') : null;

$('address-form').onsubmit = (e) => {
  e.preventDefault();
  cmd('navigate', $('address').value);
  $('address').blur();
};
$('address').onfocus = (e) => {
  e.target.select();
  updateSuggestions({ onFocus: true });
};
// Wait a moment: a press on the overlay moves focus out of here just before its pick arrives.
$('address').onblur = () => setTimeout(() => document.activeElement !== $('address') && hideSuggestions(), 150);
$('address').oninput = () => updateSuggestions();
$('address').onkeydown = (e) => {
  if (suggestionsOpen && e.key === 'Enter') {
    e.preventDefault();
    pickSuggestion(suggestionRows[selectedRow]);
  } else if (suggestionsOpen && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
    e.preventDefault();
    const n = suggestionRows.length;
    selectRow((selectedRow + (e.key === 'ArrowDown' ? 1 : -1) + n) % n);
  } else if (e.key === 'Escape') {
    if (suggestionsOpen) return hideSuggestions();
    renderToolbar();
    cmd('focusContent');
  }
};

// ---------- address bar suggestions ----------
// The list is drawn by an overlay view on top of the page (ui/suggest.html); this side owns the
// rows and the selection, and tells main where to put the overlay.

let suggestionRows = []; // [{ kind: 'typed' | 'tab' | 'history', ... }]
let selectedRow = 0;
let suggestSeq = 0;
let suggestionsOpen = false;

const activeTabState = () => state && state.workspaces[state.activeWs].tabs[state.workspaces[state.activeWs].activeTab];

// On focus, a blank tab lists recent pages; other tabs wait for typing (so clicking in to copy
// the address doesn't pop a list over the page).
async function updateSuggestions({ onFocus = false } = {}) {
  const address = $('address');
  if (document.activeElement !== address) return hideSuggestions();
  if (onFocus && activeTabState()?.url !== 'about:blank') return;
  const query = address.value.trim();
  const seq = ++suggestSeq;
  const matches = await window.herdr.suggest(query);
  if (seq !== suggestSeq || document.activeElement !== address) return; // a newer keystroke won
  suggestionRows = query ? [{ kind: 'typed', query }, ...matches] : matches;
  selectedRow = 0;
  if (!suggestionRows.length) return hideSuggestions();
  showSuggestions();
}

function showSuggestions() {
  const { left, bottom, width } = $('address').getBoundingClientRect();
  cmd('showSuggestions', { rows: suggestionRows, selected: selectedRow, rect: { x: left, y: bottom + 4, width } });
  suggestionsOpen = true;
}

function hideSuggestions() {
  suggestSeq++;
  suggestionRows = [];
  if (suggestionsOpen) cmd('hideSuggestions');
  suggestionsOpen = false;
}

function selectRow(i) {
  selectedRow = i;
  cmd('selectSuggestion', i);
}

function pickSuggestion(row) {
  if (!row) return;
  if (row.kind === 'tab') cmd('switchToTab', row.tabId);
  else cmd('navigate', row.kind === 'typed' ? row.query : row.url);
  hideSuggestions();
  $('address').blur();
}

window.herdr.on('suggest-hover', (i) => (selectedRow = i));
window.herdr.on('suggest-pick', (i) => pickSuggestion(suggestionRows[i]));
window.addEventListener('resize', () => suggestionsOpen && showSuggestions());

$('find-input').oninput = (e) => cmd('find', e.target.value);
$('find-input').onkeydown = (e) => {
  if (e.key === 'Enter') cmd('findNext', !e.shiftKey);
  else if (e.key === 'Escape') cmd('closeFind');
};
$('find-prev').onclick = () => cmd('findNext', false);
$('find-next').onclick = () => cmd('findNext', true);
$('find-close').onclick = () => cmd('closeFind');
window.herdr.on('focus-find', () => {
  $('find-input').focus();
  $('find-input').select();
});

window.herdr.on('state', (s) => {
  state = s;
  render();
  if (pendingRename && !state.sidebarCollapsed) {
    const { kind, id } = pendingRename;
    pendingRename = null;
    requestAnimationFrame(() => startRename(kind, id));
  }
});
window.herdr.on('rename', ({ kind, id }) => requestAnimationFrame(() => requestRename(kind, id)));
window.herdr.on('focus-address', () => {
  $('address').focus();
  $('address').select();
});
window.herdr.on('toggle-help', () => ($('help').hidden = !$('help').hidden));
window.herdr.ready();
