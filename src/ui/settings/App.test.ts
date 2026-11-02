// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/svelte';
import { flushSync } from 'svelte';
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import App from './App.svelte';
import type { SettingsApi } from '../page-preload';
import type { ResolveResult, SettingsData } from '../../types';
import type { ResolvedEndpoint } from 'electron';

const providers = [
  { id: 'system', name: 'System', detail: 'Your network' },
  { id: 'cloudflare', name: 'Cloudflare', detail: '1.1.1.1' },
  { id: 'custom', name: 'Custom', detail: 'Your own server' },
];
const about: SettingsData['about'] = {
  platform: 'linux',
  version: '1.2.3',
  chrome: '140',
  electron: '45',
  profile: '/home/me/.config/herdr',
};

let api: { [K in keyof SettingsApi]: Mock<SettingsApi[K]> };
// The element the test knows is on the page, as the kind of element it is.
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const find = <T extends HTMLElement = HTMLElement>(selector: string) => document.querySelector<T>(selector)!;
const flush = async () => {
  await new Promise((resolve) => setTimeout(resolve));
  flushSync();
};

async function open({ hash = '', provider = 'system', platform = 'linux' as NodeJS.Platform } = {}) {
  cleanup();
  history.replaceState(null, '', `/${hash}`);
  api = {
    get: vi.fn(async (): Promise<SettingsData> => ({
      settings: { dns: { provider, customUrl: 'https://dns.example/q' } },
      providers,
      about: { ...about, platform },
    })),
    setDns: vi.fn(async () => {}),
    resolve: vi.fn<SettingsApi['resolve']>(),
  };
  window.herdrSettings = api;
  render(App);
  await flush();
}

afterEach(cleanup);

const selectedTab = () => find('[role="tab"][aria-selected="true"]').dataset.tab;
const visiblePanels = () => [...document.querySelectorAll<HTMLElement>('[role="tabpanel"]')].filter((p) => !p.hidden).map((p) => p.id);
const radio = (id: string) => find<HTMLInputElement>(`input[name="dns"][value="${id}"]`);
const click = (el: HTMLElement) => flushSync(() => el.click());
const submit = (form: HTMLElement) => flushSync(() => form.dispatchEvent(new Event('submit', { cancelable: true })));
const typeInto = (input: HTMLInputElement, value: string) => {
  input.value = value;
  flushSync(() => input.dispatchEvent(new Event('input', { bubbles: true })));
};

describe('tabs', () => {
  beforeEach(() => open());

  it('opens on the first tab', () => {
    expect(selectedTab()).toBe('dns');
    expect(visiblePanels()).toEqual(['dns']);
    expect(location.hash).toBe('#dns');
    expect($('dns').hidden).toBe(false);
    expect(find('[data-tab="dns"]').tabIndex).toBe(0);
    expect(find('[data-tab="about"]').tabIndex).toBe(-1);
  });

  it('switches tab on click and keeps it in the URL', () => {
    click(find('[data-tab="shortcuts"]'));
    expect(selectedTab()).toBe('shortcuts');
    expect(visiblePanels()).toEqual(['shortcuts']);
    expect(location.hash).toBe('#shortcuts');
  });

  it('ignores clicks between tabs', () => {
    click($('tabs'));
    expect(selectedTab()).toBe('dns');
  });

  it('moves between tabs with the up and down arrows, wrapping around', () => {
    const tabs = $('tabs');
    const key = (k: string) => {
      const e = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true });
      flushSync(() => tabs.dispatchEvent(e));
      return e;
    };
    find('[data-tab="dns"]').focus();
    expect(key('ArrowDown').defaultPrevented).toBe(true);
    expect(selectedTab()).toBe('shortcuts');
    expect((document.activeElement as HTMLElement).dataset.tab).toBe('shortcuts');
    key('ArrowUp');
    key('ArrowUp');
    expect(selectedTab()).toBe('about');
    expect(location.hash).toBe('#about');
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
    expect(visiblePanels()).toEqual(['about']);
  });

  it('falls back to the first tab for an unknown one', async () => {
    await open({ hash: '#nope' });
    expect(selectedTab()).toBe('dns');
    expect(location.hash).toBe('#dns');
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
    expect(list).toHaveLength(18);
  });

  it('lists the macOS keys on a Mac', async () => {
    await open({ platform: 'darwin' });
    const list = shortcuts();
    expect(list).toContainEqual(['New tab', 'Cmd+T']);
    expect(list).toContainEqual(['Close tab', 'Ctrl+W']);
    expect(list).toContainEqual(['Reopen closed tab', 'Cmd+Shift+T']);
    expect(list).toContainEqual(['Downloads', 'Cmd+Option+L']);
    expect(list).toHaveLength(19);
  });

  it('lists the versions and profile folder', async () => {
    await open();
    const text = [...document.querySelectorAll('#about-list > *')].map((n) => n.textContent);
    expect(text).toEqual(['Version', '1.2.3', 'Chromium', '140', 'Electron', '45', 'Profile folder', about.profile]);
  });
});

describe('before the settings load', () => {
  it('shows the tabs with empty lists', () => {
    cleanup();
    window.herdrSettings = { get: () => new Promise(() => {}), setDns: vi.fn(), resolve: vi.fn() };
    render(App);
    expect(document.querySelectorAll('[role="tab"]')).toHaveLength(3);
    expect(document.querySelectorAll('#shortcut-list tr, #about-list > *, #dns-providers label')).toHaveLength(0);
  });
});

describe('DNS form', () => {
  it('lists the providers with the saved one chosen', async () => {
    await open({ provider: 'cloudflare' });
    const labels = [...document.querySelectorAll('#dns-providers .provider')];
    expect(labels.map((l) => l.querySelector('.name')!.textContent)).toEqual(['System', 'Cloudflare', 'Custom']);
    expect(labels[1].querySelector('.detail')!.textContent).toBe('1.1.1.1');
    expect(radio('cloudflare').checked).toBe(true);
    expect($<HTMLInputElement>('custom-url').value).toBe('https://dns.example/q');
    expect($('custom-row').hidden).toBe(true);
  });

  it('shows the server address only for a custom server', async () => {
    await open({ provider: 'custom' });
    expect($('custom-row').hidden).toBe(false);
    click(radio('system'));
    expect($('custom-row').hidden).toBe(true);
    click(radio('custom'));
    expect($('custom-row').hidden).toBe(false);
  });

  it('saves the chosen server', async () => {
    await open();
    click(radio('custom'));
    typeInto($<HTMLInputElement>('custom-url'), 'https://mine.example/dns-query');
    submit($('dns-form'));
    expect($<HTMLButtonElement>('dns-save').disabled).toBe(true);
    await flush();
    expect(api.setDns).toHaveBeenCalledWith({ provider: 'custom', customUrl: 'https://mine.example/dns-query' });
    expect($('dns-status').textContent).toBe('Saved. New lookups use this server.');
    expect($('dns-status').classList.contains('ok')).toBe(true);
    expect($('dns-status').classList.contains('text-ok')).toBe(true);
    expect($<HTMLButtonElement>('dns-save').disabled).toBe(false);
  });

  it('shows why saving failed, without the IPC wrapper text', async () => {
    await open();
    api.setDns.mockRejectedValueOnce(new Error("Error invoking remote method 'settings-set-dns': Error: Not a valid https URL"));
    submit($('dns-form'));
    await flush();
    expect($('dns-status').textContent).toBe('Not a valid https URL');
    expect($('dns-status').classList.contains('error')).toBe(true);
    expect($('dns-status').classList.contains('text-error')).toBe(true);
    expect($<HTMLButtonElement>('dns-save').disabled).toBe(false);
  });
});

// A lookup result as Electron gives it: the page shows the family as it comes.
const endpoint = (family: ResolvedEndpoint['family'], address: string): ResolvedEndpoint => ({ family, address });

describe('lookup test', () => {
  beforeEach(() => open());
  const results = () => [...document.querySelectorAll('#resolve-result li')];

  it('lists the addresses found', async () => {
    let answer!: (result: ResolveResult) => void;
    api.resolve.mockReturnValueOnce(new Promise((resolve) => (answer = resolve)));
    typeInto($<HTMLInputElement>('resolve-host'), '  example.com ');
    submit($('resolve-form'));
    expect(api.resolve).toHaveBeenCalledWith('example.com');
    expect(results().map((li) => li.textContent)).toEqual(['Looking up…']);
    answer({
      addresses: [endpoint('ipv4', '93.184.215.14'), endpoint('ipv6', '2606:2800::1')],
    });
    await flush();
    expect(results().map((li) => [li.querySelector('.family')!.textContent, li.textContent])).toEqual([
      ['ipv4', 'ipv493.184.215.14'],
      ['ipv6', 'ipv62606:2800::1'],
    ]);
  });

  it('shows a lookup error', async () => {
    api.resolve.mockResolvedValueOnce({ error: 'ENOTFOUND' });
    typeInto($<HTMLInputElement>('resolve-host'), 'nope.invalid');
    submit($('resolve-form'));
    await flush();
    expect(results()).toHaveLength(1);
    expect(results()[0].classList.contains('error')).toBe(true);
    expect(results()[0].textContent).toBe("Couldn't look up nope.invalid: ENOTFOUND");
  });

  it('does nothing without a host', () => {
    typeInto($<HTMLInputElement>('resolve-host'), '   ');
    submit($('resolve-form'));
    expect(api.resolve).not.toHaveBeenCalled();
    expect(results()).toHaveLength(0);
  });

  it('looks up example.com by default', () => {
    api.resolve.mockReturnValueOnce(new Promise(() => {}));
    submit($('resolve-form'));
    expect(api.resolve).toHaveBeenCalledWith('example.com');
  });
});
