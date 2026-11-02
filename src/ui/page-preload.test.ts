// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { checkTextFocus, fakeElectron, runInMainWorld, runPreload } from '../testing/dom';

afterEach(() => vi.unstubAllGlobals());

describe('page-preload.ts (every web page)', () => {
  it('gives normal pages no settings API', async () => {
    const electron = fakeElectron();
    await runPreload('src/ui/page-preload.ts', electron);
    expect(electron.contextBridge.exposeInMainWorld).not.toHaveBeenCalled();
  });

  it('gives herdr://settings the settings API', async () => {
    vi.stubGlobal('location', { protocol: 'herdr:', host: 'settings' });
    const electron = fakeElectron();
    await runPreload('src/ui/page-preload.ts', electron);
    const api = electron.api('herdrSettings');
    await expect(api.get()).resolves.toEqual(['settings-get']);
    await expect(api.setDns({ provider: 'system', customUrl: '' })).resolves.toEqual([
      'settings-set-dns',
      { provider: 'system', customUrl: '' },
    ]);
    await expect(api.resolve('example.com')).resolves.toEqual(['settings-resolve', 'example.com']);
  });

  it("doesn't give other herdr pages the settings API", async () => {
    vi.stubGlobal('location', { protocol: 'herdr:', host: 'other' });
    const electron = fakeElectron();
    await runPreload('src/ui/page-preload.ts', electron);
    expect(electron.exposed.herdrSettings).toBeUndefined();
  });

  it('reports when a text field has focus', async () => {
    const electron = fakeElectron();
    await runPreload('src/ui/page-preload.ts', electron);
    checkTextFocus(electron);
  });

  describe('passkey refusal', () => {
    // Runs the function the preload puts in the page, against a fake WebAuthn.
    async function installInPage({ capabilities = true } = {}) {
      const electron = fakeElectron();
      await runPreload('src/ui/page-preload.ts', electron);
      const credentials = {
        get: vi.fn(async (_options?: object) => 'password'),
        create: vi.fn(async (_options?: object) => 'made'),
      };
      const PublicKeyCredential = {
        isUserVerifyingPlatformAuthenticatorAvailable: async () => true,
        isConditionalMediationAvailable: async () => true,
        ...(capabilities && { getClientCapabilities: async () => ({ conditionalGet: true }) }),
      };
      vi.stubGlobal('navigator', { credentials });
      vi.stubGlobal('PublicKeyCredential', PublicKeyCredential);
      const { get, create } = credentials;
      runInMainWorld(electron);
      return { electron, credentials, PublicKeyCredential, get, create };
    }

    it('refuses passkey requests right away and says so', async () => {
      const { electron, credentials } = await installInPage();
      await expect(credentials.get({ publicKey: {} })).rejects.toMatchObject({ name: 'NotAllowedError' });
      await expect(credentials.create({ publicKey: {} })).rejects.toMatchObject({ name: 'NotAllowedError' });
      expect(electron.ipcRenderer.send).toHaveBeenCalledWith('passkey-request', 'get');
      expect(electron.ipcRenderer.send).toHaveBeenCalledWith('passkey-request', 'create');
    });

    it("doesn't show the bar for autofill requests", async () => {
      const { electron, credentials } = await installInPage();
      await expect(credentials.get({ publicKey: {}, mediation: 'conditional' })).rejects.toThrow('Passkeys are not available');
      expect(electron.ipcRenderer.send).not.toHaveBeenCalledWith('passkey-request', 'get');
    });

    it('lets other credential requests through', async () => {
      const { credentials, get, create } = await installInPage();
      await expect(credentials.get({ password: true })).resolves.toBe('password');
      await expect(credentials.create()).resolves.toBe('made');
      expect(get).toHaveBeenCalledWith({ password: true });
      expect(create).toHaveBeenCalledWith(undefined);
      expect(credentials.get.name).toBe('get');
    });

    it('reports no platform passkeys', async () => {
      const { PublicKeyCredential } = await installInPage();
      await expect(PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()).resolves.toBe(false);
      await expect(PublicKeyCredential.isConditionalMediationAvailable()).resolves.toBe(false);
      await expect(PublicKeyCredential.getClientCapabilities!()).resolves.toEqual({
        conditionalGet: false,
        conditionalCreate: false,
        hybridTransport: false,
        passkeyPlatformAuthenticator: false,
        userVerifyingPlatformAuthenticator: false,
      });
    });

    it('leaves getClientCapabilities out where the browser has none', async () => {
      const { PublicKeyCredential } = await installInPage({ capabilities: false });
      expect(PublicKeyCredential.getClientCapabilities).toBeUndefined();
    });

    it('does nothing without WebAuthn', async () => {
      const electron = fakeElectron();
      await runPreload('src/ui/page-preload.ts', electron);
      vi.stubGlobal('navigator', {});
      expect(() => runInMainWorld(electron)).not.toThrow();
      const credentials = { get: vi.fn() };
      vi.stubGlobal('navigator', { credentials });
      vi.stubGlobal('PublicKeyCredential', undefined);
      runInMainWorld(electron);
      expect(vi.isMockFunction(credentials.get)).toBe(true);
    });
  });
});
