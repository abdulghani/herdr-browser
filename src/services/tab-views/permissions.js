// Grant the everyday permissions; refuse the rest (no prompt UI yet).
const { session } = require('electron');

const ALLOWED = new Set(['notifications', 'media', 'fullscreen', 'clipboard-sanitized-write', 'pointerLock']);

function handlePermissions(ctx) {
  session.defaultSession.setPermissionRequestHandler((wc, perm, cb, details) => {
    // A tab using the camera or mic must not be put to sleep.
    if (perm === 'media' && details.mediaTypes?.length) {
      const tabId = ctx.views.tabIdOf(wc);
      if (tabId) ctx.sleeping.noteMedia(tabId);
    }
    cb(ALLOWED.has(perm));
  });
}

module.exports = { handlePermissions };
