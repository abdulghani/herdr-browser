// A stand-in for Electrobun's 'electrobun/view' in the tests (vitest.config.mjs points the import
// here): Electroview.defineRPC keeps the handlers, and `sent`/`requests` record what the page sends.
import { vi } from 'vitest';

export class Electroview {
  static last = null;

  static defineRPC({ handlers }) {
    const rpc = {
      handlers,
      send: { cmd: vi.fn(), ready: vi.fn(), tabView: vi.fn() },
      request: { suggest: vi.fn(async (query) => [{ query }]) },
      // Plays a message from main.
      receive: (name, payload) => handlers.messages['*'](name, payload),
    };
    return rpc;
  }

  constructor({ rpc }) {
    this.rpc = rpc;
    Electroview.last = this;
  }
}
