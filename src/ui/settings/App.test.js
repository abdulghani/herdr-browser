// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/svelte';
import { flushSync } from 'svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App.svelte';

const about = {
  platform: 'linux',
  version: '1.2.3',
  webkit: '21624.1',
  electrobun: '2.0.5',
  bun: '1.4.4',
  profile: '/Users/me/Library/Application Support/dev.herdr.browser.electrobun/stable',
  downloads: '/Users/me/Downloads',
};

let api;
const $ = (id) => document.getElementById(id);
const flush = async () => {
  await new Promise((resolve) => setTimeout(resolve));
  flushSync();
};

async function open({ hash = '', platform = 'linux' } = {}) {
  cleanup();
  history.replaceState(null, '', `/${hash}`);
  api = { get: vi.fn(async () => ({ about: { ...about, platform } })) };
  window.herdrSettings = api;
  render(App);
  await flush();
}

afterEach(cleanup);

const selectedTab = () => document.querySelector('[role="tab"][aria-selected="true"]').dataset.tab;
const visiblePanels = () => [...document.querySelectorAll('[role="tabpanel"]')].filter((p) => !p.hidden).map((p) => p.id);
const click = (el) => flushSync(() => el.click());

describe('tabs', () => {
  beforeEach(() => open());

  it('opens on the first tab', () => {
    expect(selectedTab()).toBe('shortcuts');
    expect(visiblePanels()).toEqual(['shortcuts']);
    expect(location.hash).toBe('#shortcuts');
    expect(document.querySelector('[data-tab="shortcuts"]').tabIndex).toBe(0);
    expect(document.querySelector('[data-tab="about"]').tabIndex).toBe(-1);
    // With WebKit the browser can't choose its DNS server, so there is no DNS section.
    expect($('dns')).toBeNull();
  });

  it('switches tab on click and keeps it in the URL', () => {
    click(document.querySelector('[data-tab="about"]'));
    expect(selectedTab()).toBe('about');
    expect(visiblePanels()).toEqual(['about']);
    expect(location.hash).toBe('#about');
  });

  it('ignores clicks between tabs', () => {
    click($('tabs'));
    expect(selectedTab()).toBe('shortcuts');
  });

  it('moves between tabs with the up and down arrows, wrapping around', () => {
    const tabs = $('tabs');
    const key = (k) => {
      const e = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true });
      flushSync(() => tabs.dispatchEvent(e));
      return e;
    };
    document.querySelector('[data-tab="shortcuts"]').focus();
    expect(key('ArrowDown').defaultPrevented).toBe(true);
    expect(selectedTab()).toBe('about');
    expect(document.activeElement.dataset.tab).toBe('about');
    key('ArrowDown');
    expect(selectedTab()).toBe('shortcuts');
    key('ArrowUp');
    expect(selectedTab()).toBe('about');
    expect(location.hash).toBe('#about');
    expect(key('ArrowLeft').defaultPrevented).toBe(false);
    expect(selectedTab()).toBe('about');
  });
});

describe('opening with a tab in the URL', () => {
  it('shows that tab', async () => {
    await open({ hash: '#about' });
    expect(selectedTab()).toBe('about');
    expect(visiblePanels()).toEqual(['about']);
  });

  it('falls back to the first tab for an unknown one', async () => {
    await open({ hash: '#dns' });
    expect(selectedTab()).toBe('shortcuts');
    expect(location.hash).toBe('#shortcuts');
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
    expect(list).toHaveLength(19);
  });

  it('lists the macOS keys on a Mac', async () => {
    await open({ platform: 'darwin' });
    const list = shortcuts();
    expect(list).toContainEqual(['New tab', 'Cmd+T']);
    expect(list).toContainEqual(['Close tab', 'Cmd+W, Ctrl+W']);
    expect(list).toContainEqual(['Reopen closed tab', 'Cmd+Shift+T']);
    expect(list).toContainEqual(['Downloads', 'Cmd+Option+L']);
    expect(list).toContainEqual(['Back / forward', 'Cmd+[ / Cmd+]']);
    expect(list).toHaveLength(20);
  });

  it('lists the versions and folders', async () => {
    await open();
    const text = [...document.querySelectorAll('#about-list > *')].map((n) => n.textContent);
    expect(text).toEqual([
      'Version',
      '1.2.3',
      'WebKit',
      '21624.1',
      'Electrobun',
      '2.0.5',
      'Bun',
      '1.4.4',
      'Profile folder',
      about.profile,
      'Downloads folder',
      about.downloads,
    ]);
  });
});

describe('before the settings load', () => {
  it('shows the tabs with empty lists', () => {
    cleanup();
    window.herdrSettings = { get: () => new Promise(() => {}) };
    render(App);
    expect(document.querySelectorAll('[role="tab"]')).toHaveLength(2);
    expect(document.querySelectorAll('#shortcut-list tr, #about-list > *')).toHaveLength(0);
  });
});
