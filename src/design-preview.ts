import scenes from './preview-scenes.json';
import { previewSnapshot } from './preview';
import type { Activity, Provider, Snapshot } from './types';

export interface PreviewScene {
  id: string;
  title: string;
  group: 'Island' | 'Setup' | 'Panels' | 'Brand';
  width: number;
  height: number;
  expanded?: boolean;
  selectedId?: string;
  activity?: Activity;
  detail?: string;
  single?: boolean;
  multiWorking?: boolean;
  paused?: boolean;
  empty?: boolean;
  unavailable?: boolean;
  detailsOpen?: boolean;
  sessionList?: boolean;
  panel?: 'setup' | 'settings' | 'history';
  step?: number;
  connector?: Provider;
  disconnected?: boolean;
  notInstalled?: boolean;
  confirmClear?: boolean;
  emptyHistory?: boolean;
  brand?: 'light' | 'dark' | 'icon' | 'mascot';
}

export const PREVIEW_SCENES = scenes as PreviewScene[];
export const PREVIEW_GROUPS = ['Island', 'Setup', 'Panels', 'Brand'] as const;

export function sceneSnapshot(scene: PreviewScene): Snapshot {
  const snapshot = previewSnapshot();
  if (scene.single)
    snapshot.sessions = snapshot.sessions.filter(
      (s) => s.id === (scene.selectedId ?? 'demo-claude'),
    );
  if (scene.multiWorking)
    snapshot.sessions.forEach((s) => {
      s.activity = 'working';
    });
  if (scene.empty) snapshot.sessions = [];
  if (scene.paused) snapshot.preferences.paused = true;
  const selected = snapshot.sessions.find((s) => s.id === (scene.selectedId ?? 'demo-claude'));
  if (selected) {
    if (scene.activity) {
      selected.activity = scene.activity;
      selected.detail = scene.detail ?? selected.detail;
      selected.tasks =
        scene.activity === 'finished'
          ? selected.tasks.map((t) => ({ ...t, status: 'completed' }))
          : [];
    }
    if (scene.unavailable) {
      selected.tokens = null;
      selected.contextPercent = null;
      selected.limits = [];
      selected.tasks = [];
    }
  }
  if (scene.disconnected || scene.notInstalled) {
    snapshot.connectors.forEach((connector) => {
      connector.enabled = false;
      if (scene.notInstalled) {
        connector.detected = false;
        connector.version = null;
      }
    });
  }
  return snapshot;
}
