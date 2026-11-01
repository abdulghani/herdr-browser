// Moving the keyboard focus between the browser UI's view and a page's view. Electrobun has no call
// for it, and a page's WebKit view keeps the focus even when the UI focuses one of its own fields,
// so this asks macOS directly, through Bun's FFI and the Objective-C runtime: Electrobun's pointer
// for a view is its WKWebViewImpl, whose `webView` is the WKWebView; the window is told, on its
// main thread, to make that the first responder. Only runs under Bun on macOS; elsewhere (and in
// the tests, on Node) it does nothing.

let objc; // { msg, perform, sel } once loaded, or false when it can't be

function load() {
  if (objc !== undefined) return objc;
  objc = false;
  if (process.platform !== 'darwin' || !process.versions.bun) return objc;
  try {
    const { dlopen, FFIType, ptr } = require('bun:ffi');
    const LIBOBJC = '/usr/lib/libobjc.A.dylib';
    // objc_msgSend takes whatever the method does, so it is bound once per shape.
    const getter = dlopen(LIBOBJC, {
      sel_registerName: { args: [FFIType.ptr], returns: FFIType.ptr },
      objc_msgSend: { args: [FFIType.ptr, FFIType.ptr], returns: FFIType.ptr },
    }).symbols;
    const performer = dlopen(LIBOBJC, {
      objc_msgSend: { args: [FFIType.ptr, FFIType.ptr, FFIType.ptr, FFIType.ptr, FFIType.bool], returns: FFIType.void },
    }).symbols;
    const names = new Map();
    const sel = (name) => {
      if (!names.has(name)) names.set(name, getter.sel_registerName(ptr(Buffer.from(`${name}\0`))));
      return names.get(name);
    };
    objc = { msg: getter.objc_msgSend, perform: performer.objc_msgSend, sel };
  } catch (err) {
    console.error('native focus unavailable', err);
  }
  return objc;
}

// Give the keyboard focus to an Electrobun view (a BrowserView, or a window's webview).
function focusView(view) {
  const lib = load();
  const impl = view?.ptr;
  if (!lib || !impl) return false;
  const webView = lib.msg(impl, lib.sel('webView'));
  const window = webView && lib.msg(webView, lib.sel('window'));
  if (!window) return false;
  lib.perform(window, lib.sel('performSelectorOnMainThread:withObject:waitUntilDone:'), lib.sel('makeFirstResponder:'), webView, false);
  return true;
}

module.exports = { focusView };
