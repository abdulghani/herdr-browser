// The herdr://settings page. window.herdrSettings comes from page-preload.js, which only
// exposes it on this page.
const $ = (id) => document.getElementById(id);
const api = window.herdrSettings;

const el = (tag, props = {}, children = []) => {
  const node = Object.assign(document.createElement(tag), props);
  for (const child of children) node.append(child);
  return node;
};

const chosenProvider = () => document.querySelector('input[name="dns"]:checked')?.value;
const showCustom = () => ($('custom-row').hidden = chosenProvider() !== 'custom');

function setStatus(text, kind = '') {
  $('dns-status').textContent = text;
  $('dns-status').className = kind;
}

// ---------- tabs ----------

// The open tab is kept in the URL (herdr://settings/#shortcuts), so a reload stays on it.
function showTab(name) {
  const tabs = [...document.querySelectorAll('[role="tab"]')];
  const tab = tabs.find((t) => t.dataset.tab === name) || tabs[0];
  for (const t of tabs) {
    const selected = t === tab;
    t.setAttribute('aria-selected', selected);
    t.tabIndex = selected ? 0 : -1;
    $(t.dataset.tab).hidden = !selected;
  }
  history.replaceState(null, '', `#${tab.dataset.tab}`);
  return tab;
}

$('tabs').onclick = (e) => e.target.dataset.tab && showTab(e.target.dataset.tab);
// Up/down arrows move between tabs, like a native tab list.
$('tabs').onkeydown = (e) => {
  if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
  e.preventDefault();
  const tabs = [...document.querySelectorAll('[role="tab"]')];
  const i = tabs.indexOf(document.activeElement) + (e.key === 'ArrowDown' ? 1 : -1);
  showTab(tabs[(i + tabs.length) % tabs.length].dataset.tab).focus();
};
showTab(location.hash.slice(1));

// ---------- shortcuts ----------

// [action, keys elsewhere, keys on macOS (when different)]
const SHORTCUTS = [
  ['New tab', 'Ctrl+T', 'Cmd+T'],
  ['Close tab', 'Ctrl+W'],
  ['Reopen closed tab', null, 'Cmd+Shift+T'],
  ['New workspace', 'Ctrl+Shift+T'],
  ['Next / previous tab', 'Alt+→ / Alt+←, Ctrl+Tab'],
  ['Jump to tab', 'Alt+1–9', 'Cmd+1–9'],
  ['Next / previous workspace', 'Alt+↓ / Alt+↑'],
  ['Jump to workspace', 'Ctrl+1–9'],
  ['Move tab / workspace', 'Alt+Shift+arrows'],
  ['Address bar', 'Ctrl+L', 'Cmd+L'],
  ['Find in page', 'Ctrl+F', 'Cmd+F'],
  ['Downloads', 'Ctrl+J', 'Cmd+Option+L'],
  ['Back / forward', 'Ctrl+[ / Ctrl+]'],
  ['Reload', 'Ctrl+R'],
  ['Collapse sidebar', 'Ctrl+B'],
  ['Developer tools', 'Ctrl+Shift+I', 'Cmd+Shift+J'],
  ['Settings', 'Ctrl+,', 'Cmd+,'],
  ['Rename tab / workspace', 'Prefix R / Prefix Shift+R'],
  ['Show key help', 'Prefix ?'],
];

function renderShortcuts(platform) {
  const mac = platform === 'darwin';
  $('shortcut-list').replaceChildren(
    ...SHORTCUTS.filter(([, other, macKeys]) => (mac ? macKeys || other : other)).map(([action, other, macKeys]) =>
      el('tr', {}, [el('td', { textContent: action }), el('td', {}, [el('kbd', { textContent: mac ? macKeys || other : other })])]),
    ),
  );
}

// ---------- about ----------

function renderAbout(about) {
  const rows = [
    ['Version', about.version],
    ['Chromium', about.chrome],
    ['Electron', about.electron],
    ['Profile folder', about.profile],
  ];
  $('about-list').replaceChildren(...rows.flatMap(([name, value]) => [el('dt', { textContent: name }), el('dd', { textContent: value })]));
}

// ---------- DNS ----------

async function load() {
  const { settings, providers, about } = await api.get();
  renderShortcuts(about.platform);
  renderAbout(about);
  $('dns-providers').replaceChildren(
    ...providers.map((p) =>
      el('label', { className: 'provider' }, [
        el('input', { type: 'radio', name: 'dns', value: p.id, checked: p.id === settings.dns.provider, onchange: showCustom }),
        el('span', { className: 'name', textContent: p.name }),
        el('span', { className: 'detail', textContent: p.detail }),
      ]),
    ),
  );
  $('custom-url').value = settings.dns.customUrl;
  showCustom();
}

$('dns-form').onsubmit = async (e) => {
  e.preventDefault();
  $('dns-save').disabled = true;
  try {
    await api.setDns({ provider: chosenProvider(), customUrl: $('custom-url').value });
    setStatus('Saved. New lookups use this server.', 'ok');
  } catch (err) {
    setStatus(err.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, ''), 'error');
  } finally {
    $('dns-save').disabled = false;
  }
};

$('resolve-form').onsubmit = async (e) => {
  e.preventDefault();
  const host = $('resolve-host').value.trim();
  if (!host) return;
  const result = $('resolve-result');
  result.replaceChildren(el('li', { textContent: 'Looking up…' }));
  const { addresses, error } = await api.resolve(host);
  result.replaceChildren(
    ...(error
      ? [el('li', { className: 'error', textContent: `Couldn't look up ${host}: ${error}` })]
      : addresses.map((a) => el('li', {}, [el('span', { className: 'family', textContent: a.family }), a.address]))),
  );
};

load();
