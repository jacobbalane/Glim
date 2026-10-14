import type { ComponentType } from 'react';
import { ChartNoAxesCombined, Pause, Play, Plug, Power, Settings2 } from 'lucide-react';
import HorizontalCentreIcon from './HorizontalCentreIcon';
import { QUICK_OPTION_ORDER, type Preferences, type QuickOptionId } from './types';

export const QUICK_OPTIONS = {
  centre: { label: 'Centre horizontally', Icon: HorizontalCentreIcon },
  pause: { label: 'Pause monitoring', Icon: Pause },
  settings: { label: 'Settings', Icon: Settings2 },
  usage: { label: 'Usage history', Icon: ChartNoAxesCombined },
  setup: { label: 'Connect agents', Icon: Plug },
  quit: { label: 'Quit Glim', Icon: Power },
} satisfies Record<QuickOptionId, { label: string; Icon: ComponentType<{ size?: number }> }>;

export type QuickAction = {
  id: QuickOptionId;
  label: string;
  Icon: ComponentType<{ size?: number }>;
  run?: () => Promise<void>;
};
export function quickOptionOrder(order: readonly string[] = []) {
  return [...new Set([...order, ...QUICK_OPTION_ORDER])].filter((id): id is QuickOptionId =>
    QUICK_OPTION_ORDER.includes(id as QuickOptionId),
  );
}
export function selectedQuickOptions(prefs: Preferences) {
  const selected = new Set(prefs.quickOptions ?? ['centre', 'quit']);
  return quickOptionOrder(prefs.quickOptionsOrder).filter((id) => selected.has(id));
}
export function quickAction(
  id: QuickOptionId,
  run: QuickAction['run'],
  paused = false,
): QuickAction {
  const option = QUICK_OPTIONS[id];
  return id === 'pause' && paused
    ? { id, run, label: 'Resume monitoring', Icon: Play }
    : { id, run, ...option };
}
