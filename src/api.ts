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
  shape: async (expanded: boolean, width: number, height: number) => {
    if (native) await invoke('island_shape', { expanded, width, height });
  },
  version: () => (native ? getVersion() : Promise.resolve(packageVersion)),
  // Glim goes online only here, when the person asks: GitHub's latest release, signature checked.
  checkUpdate: (): Promise<Update | null> => (native ? check() : Promise.resolve(null)),
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
                    : 'Turn finished'),
              updatedAt: Date.now(),
            }
          : s,
      );
    emitBrowser();
  },
};
