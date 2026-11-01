import Module, { createRequire } from 'node:module';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const FILE = path.join(import.meta.dirname, 'native-focus.js');
const realPlatform = process.platform;
const realLoad = Module._load;

// Loads native-focus.js fresh, as if under Bun on macOS, with `ffi` standing in for bun:ffi.
function loadUnderBun(ffi, platform = 'darwin') {
  Object.defineProperty(process, 'platform', { value: platform, configurable: true });
  process.versions.bun = '1.4.4';
  delete require.cache[FILE];
  // bun:ffi is required when a view is first focused, so this stays until the test ends.
  Module._load = function (request, ...rest) {
    return request === 'bun:ffi' ? ffi : realLoad.call(this, request, ...rest);
  };
  return require(FILE);
}

// A fake bun:ffi whose objc_msgSend answers `webView` and `window` from these pointers.
function fakeFfi({ webView = 11, window = 22 } = {}) {
  const perform = vi.fn();
  const getter = vi.fn((target, sel) => ({ webView, window })[sel]);
  let call = 0;
  const ffi = {
    FFIType: { ptr: 'ptr', bool: 'bool', void: 'void' },
    ptr: (buffer) => buffer.toString().replace('\0', ''),
    dlopen: vi.fn(() => {
      call++;
      return call === 1 ? { symbols: { sel_registerName: (name) => name, objc_msgSend: getter } } : { symbols: { objc_msgSend: perform } };
    }),
  };
  return { ffi, perform, getter };
}

afterEach(() => {
  Module._load = realLoad;
  Object.defineProperty(process, 'platform', { value: realPlatform, configurable: true });
  delete process.versions.bun;
  delete require.cache[FILE];
  vi.restoreAllMocks();
});

describe('native focus', () => {
  it('does nothing outside Bun on macOS', () => {
    delete require.cache[FILE];
    const { focusView } = require(FILE);
    expect(focusView({ ptr: 1 })).toBe(false);
    const { ffi } = fakeFfi();
    expect(loadUnderBun(ffi, 'linux').focusView({ ptr: 1 })).toBe(false);
    expect(ffi.dlopen).not.toHaveBeenCalled();
  });

  it("makes the view's WKWebView the window's first responder, on the main thread", () => {
    const { ffi, perform, getter } = fakeFfi();
    const { focusView } = loadUnderBun(ffi);
    expect(focusView({ ptr: 5 })).toBe(true);
    expect(getter).toHaveBeenCalledWith(5, 'webView');
    expect(getter).toHaveBeenCalledWith(11, 'window');
    expect(perform).toHaveBeenCalledWith(22, 'performSelectorOnMainThread:withObject:waitUntilDone:', 'makeFirstResponder:', 11, false);
    focusView({ ptr: 6 });
    expect(ffi.dlopen).toHaveBeenCalledTimes(2);
  });

  it('gives up on a view without a pointer or a window', () => {
    const { ffi, perform } = fakeFfi({ window: null });
    const { focusView } = loadUnderBun(ffi);
    expect(focusView(null)).toBe(false);
    expect(focusView({ ptr: null })).toBe(false);
    expect(focusView({ ptr: 5 })).toBe(false);
    expect(perform).not.toHaveBeenCalled();
  });

  it('logs once when the Objective-C runtime cannot be loaded', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const ffi = {
      dlopen: () => {
        throw new Error('no libobjc');
      },
      FFIType: {},
    };
    const { focusView } = loadUnderBun(ffi);
    expect(focusView({ ptr: 5 })).toBe(false);
    expect(focusView({ ptr: 5 })).toBe(false);
    expect(console.error).toHaveBeenCalledTimes(1);
  });
});
