import { invoke, isTauri } from '@tauri-apps/api/core';
import { getVersion } from '@tauri-apps/api/app';
import { listen } from '@tauri-apps/api/event';
import { check, type Update } from '@tauri-apps/plugin-updater';
import { version as packageVersion } from '../package.json';
import {
  DEFAULT_PREFERENCES,
  type Activity,
  type DailyUsage,
  type Monitor,
  type Preferences,
  type Provider,
  type Snapshot,
} from './types';
import { previewHistory, previewSnapshot } from './preview';
import { PREVIEW_SCENES, sceneSnapshot } from './design-preview';

export const native = isTauri();
// macOS names things its own way: "Open at login", not "Start with Windows".
export const mac = /Mac/.test(navigator.platform);
// The screen the island hangs from: a Mac's camera notch, if it has one, and its menu bar's
// height, in CSS pixels. The browser preview takes ?notch=200x32 to draw the island around one.
export interface Notch {
  width: number;
  height: number;
}
export interface ScreenShape {
  notch: Notch | null;
  bar: number;
}
function previewNotch(): ScreenShape {
  const [width, height] = (new URLSearchParams(location.search).get('notch') ?? '')
    .split('x')
    .map(Number);
  return width > 0 && height > 0
    ? { notch: { width, height }, bar: height }
    : { notch: null, bar: 0 };
}
export interface Side {
  x: number;
  y: number;
  width: number;
  height: number;
}
// These fixtures are available only in the browser development server.
export const designScene =
  import.meta.env.DEV && !native
    ? PREVIEW_SCENES.find((scene) => scene.id === new URLSearchParams(location.search).get('scene'))
    : undefined;
export const designMotion = new URLSearchParams(location.search).get('motion') === '1';
export const demo = !native && new URLSearchParams(location.search).get('demo') !== '0';
let browserState: Snapshot = demo
  ? previewSnapshot()
  : { sessions: [], preferences: { ...DEFAULT_PREFERENCES }, connectors: [] };
let browserHistory: DailyUsage[] = demo ? structuredClone(previewHistory) : [];
if (designScene) {
  browserState = sceneSnapshot(designScene);
  if (designScene.emptyHistory) browserHistory = [];
}
const listeners = new Set<(s: Snapshot) => void>();
function emitBrowser() {
  listeners.forEach((fn) => fn(structuredClone(browserState)));
}
export const api = {
  snapshot: () =>
    native ? invoke<Snapshot>('snapshot') : Promise.resolve(structuredClone(browserState)),
  subscribe: async (fn: (s: Snapshot) => void) => {
    if (native) return listen<Snapshot>('glim:snapshot', (e) => fn(e.payload));
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  },
  savePreferences: async (preferences: Preferences) => {
    if (native) return invoke<void>('save_preferences', { preferences });
    browserState.preferences = preferences;
    emitBrowser();
  },
  connector: async (provider: Provider, enabled: boolean) => {
    if (native) return invoke<Snapshot>('set_connector', { provider, enabled });
    browserState.connectors = browserState.connectors.map((c) =>
      c.provider === provider ? { ...c, enabled } : c,
    );
    emitBrowser();
    return structuredClone(browserState);
  },
  history: () =>
    native ? invoke<DailyUsage[]>('history') : Promise.resolve(structuredClone(browserHistory)),
  clearHistory: async () => {
    if (native) return invoke<void>('clear_history');
    browserHistory = [];
  },
  monitors: () =>
    native
      ? invoke<Monitor[]>('monitors')
      : Promise.resolve([{ id: 'primary', name: 'Primary display' }]),
  openWindow: async (view: 'settings' | 'history' | 'setup') => {
    if (native) await invoke('open_panel', { view });
  },
  // The island's size, and a panel beside it when one is open, in window pixels.
  shape: async (
    expanded: boolean,
    width: number,
    height: number,
    side: Side | null = null,
    offset = 0,
  ) => {
    if (native) await invoke('island_shape', { expanded, width, height, side, offset });
  },
  islandPosition: async (position: number) => {
    if (native) return invoke<void>('set_island_position', { position });
    browserState.preferences = { ...browserState.preferences, islandPosition: position };
    emitBrowser();
  },
  islandDragging: async (active: boolean) => {
    if (native) await invoke('set_island_dragging', { active });
  },
  quit: async () => {
    if (native) await invoke('quit_glim');
  },
  version: () => (native ? getVersion() : Promise.resolve(packageVersion)),
  // Glim goes online only here, when the person asks: GitHub's latest release, signature checked.
  checkUpdate: (): Promise<Update | null> => (native ? check() : Promise.resolve(null)),
  // Opens the version an update just installed (macOS; Setup does it on Windows).
  relaunch: async () => {
    if (native) await invoke('relaunch');
  },
  screenShape: (): Promise<ScreenShape> =>
    native ? invoke<ScreenShape>('screen_shape') : Promise.resolve(previewNotch()),
  // Brings the window the agent runs in to the front; false when Glim can't find it.
  showAgent: (id: string): Promise<boolean> =>
    native ? invoke<boolean>('show_agent', { id }) : Promise.resolve(false),
  openRelease: async () => {
    if (native) await invoke('open_releases');
    else
      window.open('https://github.com/jacobbalane/Glim/releases', '_blank', 'noopener,noreferrer');
  },
  simulate: (kind: Activity | 'reset', sessionId?: string, detail?: string) => {
    if (!demo) return;
    if (kind === 'reset') browserState.sessions = structuredClone(previewSnapshot().sessions);
    else
      browserState.sessions = browserState.sessions.map((s, i) =>
        (sessionId ? s.id === sessionId : i === 0)
          ? {
              ...s,
              activity: kind,
              detail:
                detail ??
                (kind === 'working'
                  ? 'Running tests'
                  : kind === 'waiting'
                    ? 'Waiting for approval'
                    : kind === 'limited'
                      ? 'Usage limit reached'
                      : 'Turn finished'),
              updatedAt: Date.now(),
            }
          : s,
      );
    emitBrowser();
  },
};
