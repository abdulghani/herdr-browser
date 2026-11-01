// @vitest-environment jsdom
import { expect, it } from 'vitest';
import { runPreload, sent } from '../testing/preload.js';

it('gives the settings page what main answers', async () => {
  await runPreload({ url: 'views://ui/settings/index.html#about' });
  const first = window.herdrSettings.get();
  const second = window.herdrSettings.get();
  expect(sent.filter((m) => m.type === 'settings-get')).toHaveLength(2);
  window.__herdrSettingsReply({ about: { version: '1' } });
  expect(await first).toEqual({ about: { version: '1' } });
  expect(await second).toEqual({ about: { version: '1' } });
});
