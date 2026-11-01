// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loadBody } from '../../testing/dom.js';

const providers = [
  { id: 'system', name: 'System', detail: 'Your network' },
  { id: 'cloudflare', name: 'Cloudflare', detail: '1.1.1.1' },
  { id: 'custom', name: 'Custom', detail: 'Your own server' },
];
const about = { platform: 'linux', version: '1.2.3', chrome: '140', electron: '45', profile: '/home/me/.config/herdr' };

let api;
const $ = (id) => document.getElementById(id);
const flush = () => new Promise((resolve) => setTimeout(resolve));

async function open({ hash = '', provider = 'system', platform = 'linux' } = {}) {
  loadBody('src/ui/settings/index.html');
  history.replaceState(null, '', `/${hash}`);
  api = {
    get: vi.fn(async () => ({
      settings: { dns: { provider, customUrl: 'https://dns.example/q' } },
      providers,
      about: { ...about, platform },
    })),
    setDns: vi.fn(async () => {}),
    resolve: vi.fn(),
  };
  window.herdrSettings = api;
  vi.resetModules();
  await import('./settings.js');
  await flush();
}

const selectedTab = () => document.querySelector('[role="tab"][aria-selected="true"]').dataset.tab;
const visiblePanels = () => [...document.querySelectorAll('[role="tabpanel"]')].filter((p) => !p.hidden).map((p) => p.id);
const radio = (id) => document.querySelector(`input[name="dns"][value="${id}"]`);
const submit = (form) => form.dispatchEvent(new Event('submit', { cancelable: true }));

describe('tabs', () => {
  beforeEach(() => open());

  it('opens on the first tab', () => {
    expect(selectedTab()).toBe('dns');
    expect(visiblePanels()).toEqual(['dns']);
    expect(location.hash).toBe('#dns');
    expect($('dns').hidden).toBe(false);
    expect(document.querySelector('[data-tab="dns"]').tabIndex).toBe(0);
    expect(document.querySelector('[data-tab="about"]').tabIndex).toBe(-1);
  });

  it('switches tab on click and keeps it in the URL', () => {
    document.querySelector('[data-tab="shortcuts"]').click();
    expect(selectedTab()).toBe('shortcuts');
    expect(visiblePanels()).toEqual(['shortcuts']);
    expect(location.hash).toBe('#shortcuts');
  });

  it('ignores clicks between tabs', () => {
    $('tabs').click();
    expect(selectedTab()).toBe('dns');
  });

  it('moves between tabs with the up and down arrows, wrapping around', () => {
    const tabs = $('tabs');
    const key = (k) => {
      const e = new KeyboardEvent('keydown', { key: k, cancelable: true });
      tabs.dispatchEvent(e);
      return e;
    };
    document.querySelector('[data-tab="dns"]').focus();
    expect(key('ArrowDown').defaultPrevented).toBe(true);
    expect(selectedTab()).toBe('shortcuts');
    expect(document.activeElement.dataset.tab).toBe('shortcuts');
    key('ArrowUp');
    key('ArrowUp');
    expect(selectedTab()).toBe('about');
    key('ArrowDown');
    expect(selectedTab()).toBe('dns');
    expect(key('ArrowLeft').defaultPrevented).toBe(false);
    expect(selectedTab()).toBe('dns');
  });
});

describe('opening with a tab in the URL', () => {
  it('shows that tab', async () => {
    await open({ hash: '#about' });
    expect(selectedTab()).toBe('about');
  });

  it('falls back to the first tab for an unknown one', async () => {
    await open({ hash: '#nope' });
    expect(selectedTab()).toBe('dns');
  });
});

describe('shortcuts and about', () => {
  const shortcuts = () => [...document.querySelectorAll('#shortcut-list tr')].map((tr) => [...tr.children].map((td) => td.textContent));

  it('lists the keys for Linux and Windows', async () => {
    await open({ platform: 'linux' });
    const list = shortcuts();
    expect(list).toContainEqual(['New tab', 'Ctrl+T']);
    expect(list).toContainEqual(['Close tab', 'Ctrl+W']);
    expect(list).toContainEqual(['Downloads', 'Ctrl+J']);
    expect(list.find(([action]) => action === 'Reopen closed tab')).toBeUndefined();
  });

  it('lists the macOS keys on a Mac', async () => {
    await open({ platform: 'darwin' });
    const list = shortcuts();
    expect(list).toContainEqual(['New tab', 'Cmd+T']);
    expect(list).toContainEqual(['Close tab', 'Ctrl+W']);
    expect(list).toContainEqual(['Reopen closed tab', 'Cmd+Shift+T']);
    expect(list).toContainEqual(['Downloads', 'Cmd+Option+L']);
  });

  it('lists the versions and profile folder', async () => {
    await open();
    const text = [...document.querySelectorAll('#about-list > *')].map((n) => n.textContent);
    expect(text).toEqual(['Version', '1.2.3', 'Chromium', '140', 'Electron', '45', 'Profile folder', about.profile]);
  });
});

describe('DNS form', () => {
  it('lists the providers with the saved one chosen', async () => {
    await open({ provider: 'cloudflare' });
    const labels = [...document.querySelectorAll('#dns-providers .provider')];
    expect(labels.map((l) => l.querySelector('.name').textContent)).toEqual(['System', 'Cloudflare', 'Custom']);
    expect(labels[1].querySelector('.detail').textContent).toBe('1.1.1.1');
    expect(radio('cloudflare').checked).toBe(true);
    expect($('custom-url').value).toBe('https://dns.example/q');
    expect($('custom-row').hidden).toBe(true);
  });

  it('shows the server address only for a custom server', async () => {
    await open({ provider: 'custom' });
    expect($('custom-row').hidden).toBe(false);
    radio('system').click();
    expect($('custom-row').hidden).toBe(true);
    radio('custom').click();
    expect($('custom-row').hidden).toBe(false);
  });

  it('saves the chosen server', async () => {
    await open();
    radio('custom').click();
    $('custom-url').value = 'https://mine.example/dns-query';
    submit($('dns-form'));
    expect($('dns-save').disabled).toBe(true);
    await flush();
    expect(api.setDns).toHaveBeenCalledWith({ provider: 'custom', customUrl: 'https://mine.example/dns-query' });
    expect($('dns-status').textContent).toBe('Saved. New lookups use this server.');
    expect($('dns-status').className).toBe('ok');
    expect($('dns-save').disabled).toBe(false);
  });

  it('shows why saving failed, without the IPC wrapper text', async () => {
    await open();
    api.setDns.mockRejectedValueOnce(new Error("Error invoking remote method 'settings-set-dns': Error: Not a valid https URL"));
    submit($('dns-form'));
    await flush();
    expect($('dns-status').textContent).toBe('Not a valid https URL');
    expect($('dns-status').className).toBe('error');
    expect($('dns-save').disabled).toBe(false);
  });
});

describe('lookup test', () => {
  beforeEach(() => open());
  const results = () => [...document.querySelectorAll('#resolve-result li')];

  it('lists the addresses found', async () => {
    let answer;
    api.resolve.mockReturnValueOnce(new Promise((resolve) => (answer = resolve)));
    $('resolve-host').value = '  example.com ';
    submit($('resolve-form'));
    expect(api.resolve).toHaveBeenCalledWith('example.com');
    expect(results().map((li) => li.textContent)).toEqual(['Looking up…']);
    answer({
      addresses: [
        { family: 'IPv4', address: '93.184.215.14' },
        { family: 'IPv6', address: '2606:2800::1' },
      ],
    });
    await flush();
    expect(results().map((li) => [li.querySelector('.family').textContent, li.textContent])).toEqual([
      ['IPv4', 'IPv493.184.215.14'],
      ['IPv6', 'IPv62606:2800::1'],
    ]);
  });

  it('shows a lookup error', async () => {
    api.resolve.mockResolvedValueOnce({ error: 'ENOTFOUND' });
    $('resolve-host').value = 'nope.invalid';
    submit($('resolve-form'));
    await flush();
    expect(results()).toHaveLength(1);
    expect(results()[0].className).toBe('error');
    expect(results()[0].textContent).toBe("Couldn't look up nope.invalid: ENOTFOUND");
  });

  it('does nothing without a host', () => {
    $('resolve-host').value = '   ';
    submit($('resolve-form'));
    expect(api.resolve).not.toHaveBeenCalled();
    expect(results()).toHaveLength(0);
  });
});
