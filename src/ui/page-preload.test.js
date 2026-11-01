// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { checkTextFocus, fakeElectron, runPreload } from '../testing/dom.js';

afterEach(() => vi.unstubAllGlobals());

describe('page-preload.js (every web page)', () => {
  it('gives normal pages no settings API', () => {
    const electron = fakeElectron();
    runPreload('src/ui/page-preload.js', electron);
    expect(electron.contextBridge.exposeInMainWorld).not.toHaveBeenCalled();
  });

  it('gives herdr://settings the settings API', async () => {
    vi.stubGlobal('location', { protocol: 'herdr:', host: 'settings' });
    const electron = fakeElectron();
    runPreload('src/ui/page-preload.js', electron);
    const api = electron.exposed.herdrSettings;
    await expect(api.get()).resolves.toEqual(['settings-get']);
    await expect(api.setDns({ provider: 'system' })).resolves.toEqual(['settings-set-dns', { provider: 'system' }]);
    await expect(api.resolve('example.com')).resolves.toEqual(['settings-resolve', 'example.com']);
  });

  it("doesn't give other herdr pages the settings API", () => {
    vi.stubGlobal('location', { protocol: 'herdr:', host: 'other' });
    const electron = fakeElectron();
    runPreload('src/ui/page-preload.js', electron);
    expect(electron.exposed.herdrSettings).toBeUndefined();
  });

  it('reports when a text field has focus', () => {
    const electron = fakeElectron();
    runPreload('src/ui/page-preload.js', electron);
    checkTextFocus(electron);
  });

  describe('passkey refusal', () => {
    // Runs the function the preload puts in the page, against a fake WebAuthn.
    function installInPage({ capabilities = true } = {}) {
      const electron = fakeElectron();
      runPreload('src/ui/page-preload.js', electron);
      const { args, func } = electron.contextBridge.executeInMainWorld.mock.calls[0][0];
      const credentials = { get: vi.fn(async () => 'password'), create: vi.fn(async () => 'made') };
      const PublicKeyCredential = {
        isUserVerifyingPlatformAuthenticatorAvailable: async () => true,
        isConditionalMediationAvailable: async () => true,
        ...(capabilities && { getClientCapabilities: async () => ({ conditionalGet: true }) }),
      };
      vi.stubGlobal('navigator', { credentials });
      vi.stubGlobal('PublicKeyCredential', PublicKeyCredential);
      const { get, create } = credentials;
      func(...args);
      return { electron, credentials, PublicKeyCredential, get, create };
    }

    it('refuses passkey requests right away and says so', async () => {
      const { electron, credentials } = installInPage();
      await expect(credentials.get({ publicKey: {} })).rejects.toMatchObject({ name: 'NotAllowedError' });
      await expect(credentials.create({ publicKey: {} })).rejects.toMatchObject({ name: 'NotAllowedError' });
      expect(electron.ipcRenderer.send).toHaveBeenCalledWith('passkey-request', 'get');
      expect(electron.ipcRenderer.send).toHaveBeenCalledWith('passkey-request', 'create');
    });

    it("doesn't show the bar for autofill requests", async () => {
      const { electron, credentials } = installInPage();
      await expect(credentials.get({ publicKey: {}, mediation: 'conditional' })).rejects.toThrow('Passkeys are not available');
      expect(electron.ipcRenderer.send).not.toHaveBeenCalledWith('passkey-request', 'get');
    });

    it('lets other credential requests through', async () => {
      const { credentials, get, create } = installInPage();
      await expect(credentials.get({ password: true })).resolves.toBe('password');
      await expect(credentials.create()).resolves.toBe('made');
      expect(get).toHaveBeenCalledWith({ password: true });
      expect(create).toHaveBeenCalledWith(undefined);
      expect(credentials.get.name).toBe('get');
    });

    it('reports no platform passkeys', async () => {
      const { PublicKeyCredential } = installInPage();
      await expect(PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()).resolves.toBe(false);
      await expect(PublicKeyCredential.isConditionalMediationAvailable()).resolves.toBe(false);
      await expect(PublicKeyCredential.getClientCapabilities()).resolves.toEqual({
        conditionalGet: false,
        conditionalCreate: false,
        hybridTransport: false,
        passkeyPlatformAuthenticator: false,
        userVerifyingPlatformAuthenticator: false,
      });
    });

    it('leaves getClientCapabilities out where the browser has none', () => {
      const { PublicKeyCredential } = installInPage({ capabilities: false });
      expect(PublicKeyCredential.getClientCapabilities).toBeUndefined();
    });

    it('does nothing without WebAuthn', () => {
      const electron = fakeElectron();
      runPreload('src/ui/page-preload.js', electron);
      const { args, func } = electron.contextBridge.executeInMainWorld.mock.calls[0][0];
      vi.stubGlobal('navigator', {});
      expect(() => func(...args)).not.toThrow();
      const credentials = { get: vi.fn() };
      vi.stubGlobal('navigator', { credentials });
      vi.stubGlobal('PublicKeyCredential', undefined);
      func(...args);
      expect(vi.isMockFunction(credentials.get)).toBe(true);
    });
  });
});
