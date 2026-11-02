// The shapes shared across the app: the workspaces and tabs, what the main process sends the pages,
// and the shared `ctx` object the services (src/services) reach each other through.
import type { BrowserWindow, NavigationEntry, ResolvedEndpoint } from 'electron';
import type { createContextMenu } from './services/context-menu/context-menu';
import type { createDownloads } from './services/downloads/downloads';
import type { createFind } from './services/find/find';
import type { createHistory } from './services/history/history';
import type { createSuggestions } from './services/history/suggestions';
import type { createKeyboard } from './services/keyboard/keyboard';
import type { createPasskeys } from './services/passkeys/passkeys';
import type { createSettings } from './services/settings/settings';
import type { createSleeping } from './services/tab-views/sleeping';
import type { createTabViews } from './services/tab-views/tab-views';
import type { createClosedTabs } from './services/workspaces/closed-tabs';
import type { createSession } from './services/workspaces/session';
import type { createWorkspaces } from './services/workspaces/workspaces';

// ---------- workspaces and tabs ----------

// The bar under the toolbar of one tab. Only kind so far: a site asked for a passkey.
export interface Notice {
  kind: 'passkey';
  browser: string | null; // the browser that can open the page, if one is installed
}

export interface Tab {
  id: string;
  url: string;
  title: string;
  favicon: string | null;
  customName?: string;
  notice?: Notice;
}

export interface Workspace {
  id: string;
  name: string;
  tabs: Tab[];
  activeTab: number;
}

// The workspaces and which one is active: what session.json keeps.
export interface AppState {
  workspaces: Workspace[];
  activeWs: number;
  sidebarCollapsed?: boolean;
}

// A tab's back/forward history, kept while it has no page (asleep, restored or reopened).
export interface TabHistory {
  entries: NavigationEntry[];
  index: number;
}

// ---------- what the pages are sent ----------

// A tab's find bar while it is open.
export interface FindState {
  text: string;
  active: number;
  total: number;
}

// What the toolbar's download button shows.
export interface DownloadsSummary {
  any: boolean;
  active: number;
  progress: number | null;
  open: boolean;
}

// The 'state' message to the browser UI.
export interface UiState extends AppState {
  prefixArmed: boolean;
  awake: string[];
  find: FindState | null;
  downloads: DownloadsSummary;
  nav: { canGoBack: boolean; canGoForward: boolean; loading: boolean };
}

// A rectangle in the browser UI, where an overlay goes (x, y and width are enough).
export interface Anchor {
  x: number;
  y: number;
  width: number;
}

// An address bar suggestion: a page from history or an open tab, with the matched letters.
export interface Suggestion {
  kind: 'tab' | 'history';
  tabId?: string;
  url: string;
  title: string;
  favicon: string | null;
  displayUrl: string;
  highlight: { title: number[]; url: number[] };
  rank: number;
}

// A row of the suggestion list: what was typed, or a suggestion.
export type SuggestionRow = { kind: 'typed'; query: string } | Suggestion;

export type DownloadState = 'progressing' | 'completed' | 'cancelled' | 'interrupted';

// One row of the downloads panel.
export interface DownloadRow {
  id: number;
  filename: string;
  state: DownloadState;
  paused: boolean;
  removed: boolean;
  canResume: boolean;
  progress: number | null;
  status: string;
}

export type DownloadAction = 'open' | 'show' | 'pause' | 'resume' | 'cancel' | 'retry' | 'remove';

// The settings page's DNS choice.
export interface DnsSettings {
  provider: string;
  customUrl: string;
}

// What the settings page loads.
export interface SettingsData {
  settings: { dns: DnsSettings };
  providers: { id: string; name: string; detail: string }[];
  about: { version: string; chrome: string; electron: string; platform: NodeJS.Platform; profile: string };
}

// A test lookup on the settings page: the addresses found, or why there are none.
export type ResolveResult = { addresses: ResolvedEndpoint[]; error?: undefined } | { error: string; addresses?: undefined };

// ---------- the services ----------

type Workspaces = ReturnType<typeof createWorkspaces>;
type Session = ReturnType<typeof createSession>;
type ClosedTabs = ReturnType<typeof createClosedTabs>;
type TabViews = ReturnType<typeof createTabViews>;
type Sleeping = ReturnType<typeof createSleeping>;
type Find = ReturnType<typeof createFind>;
type Suggestions = ReturnType<typeof createSuggestions>;
type Keyboard = ReturnType<typeof createKeyboard>;
type Passkeys = ReturnType<typeof createPasskeys>;
type ContextMenu = ReturnType<typeof createContextMenu>;
type Downloads = ReturnType<typeof createDownloads>;
type History = ReturnType<typeof createHistory>;
type Settings = ReturnType<typeof createSettings>;

// The object every service gets (see src/main.ts). win, state, history and settings are only set
// once the app is ready, before anything uses them, so they are typed as always there.
export interface Ctx {
  win: BrowserWindow;
  state: AppState;
  history: History;
  settings: Settings;
  workspaces: Workspaces;
  session: Session;
  closedTabs: ClosedTabs;
  views: TabViews;
  sleeping: Sleeping;
  find: Find;
  suggestions: Suggestions;
  keyboard: Keyboard;
  passkeys: Passkeys;
  contextMenu: ContextMenu;
  downloads: Downloads;
}
