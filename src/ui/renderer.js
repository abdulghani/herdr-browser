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

  const address = $('address');
  // Don't clobber what the user is typing, unless they switched tabs.
  if (document.activeElement !== address || tab.id !== lastActiveTabId) address.value = tab.url;
  lastActiveTabId = tab.id;
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
$('address').onfocus = (e) => e.target.select();
$('address').onkeydown = (e) => {
  if (e.key === 'Escape') {
    renderToolbar();
    cmd('focusContent');
  }
};

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
