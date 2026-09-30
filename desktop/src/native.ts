import { invoke, isTauri } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import type { Snapshot, TerminalTarget } from '../../contracts/src';

export const native = isTauri();
export const readSnapshot = () => invoke<Snapshot>('snapshot');
export const revealTerminal = (target: TerminalTarget) =>
  invoke<void>('reveal_terminal', { target });
export const resizeIsland = (width: number, height: number) =>
  native ? invoke<void>('resize_island', { width, height }) : Promise.resolve();
export const dragIsland = () => (native ? getCurrentWindow().startDragging() : Promise.resolve());
export const quit = () => invoke<void>('quit');
