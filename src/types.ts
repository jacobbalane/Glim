export type Provider = 'claude' | 'codex';
export type QuickOptionId = 'centre' | 'pause' | 'settings' | 'usage' | 'setup' | 'quit';
export const QUICK_OPTION_ORDER: QuickOptionId[] = [
  'centre',
  'pause',
  'settings',
  'usage',
  'setup',
  'quit',
];
export type Activity =
  'working' | 'waiting' | 'idle' | 'finished' | 'interrupted' | 'error' | 'limited' | 'stale';
export interface Tokens {
  input: number;
  output: number;
  cached: number;
  cacheWrite: number;
  reasoning: number;
}
export interface Task {
  id: string;
  label: string;
  status: 'pending' | 'in_progress' | 'completed';
}
export interface Limit {
  label: string;
  usedPercent: number;
  resetsAt: number;
}
export interface Session {
  id: string;
  provider: Provider;
  parentId: string | null;
  project: string;
  model: string;
  activity: Activity;
  detail: string;
  startedAt: number;
  updatedAt: number;
  tokens: Tokens | null;
  contextPercent: number | null;
  // Claude's context measured against the model's usual window: no status line said, as in the
  // Claude app.
  contextEstimated?: boolean;
  tasks: Task[];
  limits: Limit[];
  source: string;
  measurementNote: string | null;
  // The agent's process (id, start time) while Glim knows it.
  process?: [number, number];
  // What the agent last said or asks; never stored.
  message?: string;
}
export interface Preferences {
  idleBehavior: 'pill' | 'hidden';
  // The closed island: the island itself, Glim in a notch just its size, or Glim alone with
  // nothing around it.
  compactStyle: 'island' | 'mini' | 'glim';
  // Whether Glim, in a mini notch or alone, shows the island while the pointer rests on it.
  hoverOpens: boolean;
  startAtLogin: boolean;
  hideFullscreen: boolean;
  monitor: string | null;
  islandPosition: number;
  // How strongly a waiting, finished or failed agent lights the island: 0 (none) to 100.
  glow: number;
  quickOptionsEnabled: boolean;
  quickOptions: QuickOptionId[];
  quickOptionsOrder: QuickOptionId[];
  paused: boolean;
  onboardingComplete: boolean;
}
export interface Connector {
  provider: Provider;
  detected: boolean;
  enabled: boolean;
  version: string | null;
  configPath: string;
  changes: string[];
  note: string;
  error: string | null;
}
export interface Snapshot {
  sessions: Session[];
  preferences: Preferences;
  connectors: Connector[];
}
export interface DailyUsage {
  day: string;
  provider: Provider;
  project: string;
  input: number;
  output: number;
  cached: number;
  cacheWrite: number;
  reasoning: number;
  sessions: number;
}
export interface Monitor {
  id: string;
  name: string;
}
export const DEFAULT_PREFERENCES: Preferences = {
  idleBehavior: 'pill',
  compactStyle: 'island',
  hoverOpens: true,
  startAtLogin: false,
  hideFullscreen: true,
  monitor: null,
  islandPosition: 0.5,
  glow: 50,
  quickOptionsEnabled: false,
  quickOptions: ['centre', 'quit'],
  quickOptionsOrder: [...QUICK_OPTION_ORDER],
  paused: false,
  onboardingComplete: false,
};
export const PROVIDERS = {
  claude: { name: 'Claude Code', short: 'Claude', color: '#d97757' },
  codex: { name: 'Codex', short: 'Codex', color: '#7a9dff' },
};
