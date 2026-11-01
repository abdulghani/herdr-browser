// Saving the workspaces and tabs to session.json in the profile, and loading them at startup.
const { app } = require('electron');
const path = require('path');
const fs = require('fs');

function createSession(ctx) {
  let saveTimer = null;
  const sessionFile = () => path.join(app.getPath('userData'), 'session.json');

  function load() {
    const { workspaces } = ctx;
    try {
      const saved = JSON.parse(fs.readFileSync(sessionFile(), 'utf8'));
      if (!saved.workspaces?.length) throw new Error('empty');
      for (const ws of saved.workspaces) {
        ws.id = workspaces.newId('w');
        for (const t of ws.tabs) {
          t.id = workspaces.newId('t');
          // Back/forward history comes back when the tab is first shown (see createView).
          if (t.history) ctx.sleeping.keepHistory(t.id, t.history);
          delete t.history;
        }
        if (!ws.tabs.length) ws.tabs.push(workspaces.newTab());
        ws.activeTab = Math.min(Math.max(ws.activeTab || 0, 0), ws.tabs.length - 1);
      }
      saved.activeWs = Math.min(Math.max(saved.activeWs || 0, 0), saved.workspaces.length - 1);
      ctx.closedTabs.restore(saved.closed);
      delete saved.closed;
      return saved;
    } catch {
      return { workspaces: [workspaces.newWorkspace('main')], activeWs: 0 };
    }
  }

  function saveSoon() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveNow, 500);
  }

  function saveNow() {
    clearTimeout(saveTimer);
    const { state } = ctx;
    const data = {
      version: 1,
      activeWs: state.activeWs,
      sidebarCollapsed: !!state.sidebarCollapsed,
      workspaces: state.workspaces.map((ws) => ({
        name: ws.name,
        activeTab: ws.activeTab,
        tabs: ws.tabs.map(ctx.closedTabs.snapshot),
      })),
      closed: ctx.closedTabs.list(),
    };
    try {
      fs.writeFileSync(sessionFile(), JSON.stringify(data, null, 2));
    } catch (err) {
      console.error('session save failed', err);
    }
  }

  return { load, saveSoon, saveNow };
}

module.exports = { createSession };
