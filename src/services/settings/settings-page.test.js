import { beforeEach, describe, expect, it } from 'vitest';
import { m, start, tab, useMain, view } from '../../testing/main-harness.js';

useMain();

const pkg = await import('../../../package.json', { with: { type: 'json' } });

describe('settings page', () => {
  beforeEach(() => start());

  it('opens in a tab, once', () => {
    m.cmd('openSettings');
    expect(tab().url).toBe('herdr://settings/');
    expect(view().url).toBe('views://ui/settings/index.html');
    m.cmd('newTab');
    m.cmd('openSettings');
    expect(tab().url).toBe('herdr://settings/');
  });

  it('answers the settings page with what the About section shows', () => {
    m.cmd('openSettings');
    view().fire('did-navigate', 'views://ui/settings/index.html#about');
    m.pageMessage(tab().id, { type: 'settings-get' });
    m.pageMessage(tab().id, { type: 'settings-get' });
    const js = view().executeJavascript.mock.calls.at(-1)[0];
    const about = JSON.parse(js.match(/^window\.__herdrSettingsReply\?\.\((.*)\)$/)[1]).about;
    expect(about).toEqual({
      version: pkg.default.version,
      webkit: '21624.1.2',
      electrobun: pkg.default.devDependencies.electrobun,
      bun: process.versions.bun || 'unknown',
      platform: process.platform,
      profile: expect.any(String),
      downloads: expect.stringMatching(/Downloads$/),
    });
    // The WebKit version is looked up once.
    expect(m.childProcess.execFileSync).toHaveBeenCalledTimes(1);
  });

  it('says unknown when the WebKit version cannot be read', () => {
    m.childProcess.execFileSync.mockImplementation(() => {
      throw new Error('no plutil');
    });
    m.cmd('openSettings');
    m.pageMessage(tab().id, { type: 'settings-get' });
    expect(view().executeJavascript.mock.calls.at(-1)[0]).toContain('"webkit":"unknown"');
  });

  it('answers no other page', () => {
    m.cmd('navigate', 'example.com');
    m.pageMessage(tab().id, { type: 'settings-get' });
    expect(view().executeJavascript).not.toHaveBeenCalled();
    m.ctx.settingsPage.reply('gone');
  });
});
