// Grant the everyday permissions; refuse the rest (no prompt UI yet).
import { session, type MediaAccessPermissionRequest } from 'electron';
import type { Ctx } from '../../types';

const ALLOWED = new Set(['notifications', 'media', 'fullscreen', 'clipboard-sanitized-write', 'pointerLock']);

export function handlePermissions(ctx: Ctx) {
  session.defaultSession.setPermissionRequestHandler((wc, perm, cb, details) => {
    // A tab using the camera or mic must not be put to sleep.
    if (perm === 'media' && (details as MediaAccessPermissionRequest).mediaTypes?.length) {
      const tabId = ctx.views.tabIdOf(wc);
      if (tabId) ctx.sleeping.noteMedia(tabId);
    }
    cb(ALLOWED.has(perm));
  });
}
