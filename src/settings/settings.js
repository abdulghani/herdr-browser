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

async function load() {
  const { settings, providers } = await api.get();
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
