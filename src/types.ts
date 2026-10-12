export type Provider = 'claude' | 'codex';
export type Activity =
  'working' | 'waiting' | 'idle' | 'finished' | 'interrupted' | 'error' | 'stale';
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
  startAtLogin: boolean;
  hideFullscreen: boolean;
  monitor: string | null;
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
  startAtLogin: false,
  hideFullscreen: true,
  monitor: null,
  paused: false,
  onboardingComplete: false,
};
export const PROVIDERS = {
  claude: { name: 'Claude Code', short: 'Claude', color: '#d97757' },
  codex: { name: 'Codex', short: 'Codex', color: '#7a9dff' },
};
