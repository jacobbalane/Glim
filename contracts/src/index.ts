export type Provider = 'claude' | 'codex';
export type Activity =
  | 'ready'
  | 'working'
  | 'tool'
  | 'approval'
  | 'input'
  | 'responded'
  | 'interrupted'
  | 'failed'
  | 'closed';
export type Health = 'live' | 'stale' | 'disconnected' | 'unverified';

export interface ProcessIdentity {
  pid: number;
  startedAt: number;
}
export interface TerminalTarget {
  windowId: string;
  terminalId: string;
  name: string;
}
export interface Session {
  id: string;
  provider: Provider;
  project: string;
  activity: Activity;
  observedAt: number;
  health: Health;
  terminal?: TerminalTarget;
  contextPercent?: number;
}
export interface UsageWindow {
  label: string;
  usedPercent: number;
  resetsAt?: number;
}
export interface AccountUsage {
  provider: Provider;
  availability: 'available' | 'unavailable';
  observedAt?: number;
  windows: UsageWindow[];
  reason?: string;
}
export interface Snapshot {
  sessions: Session[];
  accounts: AccountUsage[];
  bridgeWindows: number;
}
export const ACTIVITY: Record<Activity, string> = {
  ready: 'Ready',
  working: 'Working',
  tool: 'Using a tool',
  approval: 'Needs approval',
  input: 'Waiting for input',
  responded: 'Response finished',
  interrupted: 'Interrupted',
  failed: 'Agent error',
  closed: 'Session closed',
};
export const PROVIDER: Record<Provider, string> = { claude: 'Claude Code', codex: 'Codex' };
export function needsAttention(session: Session): boolean {
  return session.health === 'live' && ['approval', 'input', 'failed'].includes(session.activity);
}
export function summarize(sessions: Session[]) {
  const visible = sessions.filter((s) => s.activity !== 'closed');
  return {
    total: visible.length,
    working: visible.filter((s) => s.health === 'live' && ['working', 'tool'].includes(s.activity))
      .length,
    attention: visible.filter(needsAttention).length,
    unverified: visible.filter((s) => s.health !== 'live').length,
  };
}
export function usageFreshness(usage: AccountUsage, now: number): 'live' | 'stale' | 'unavailable' {
  if (
    usage.availability !== 'available' ||
    usage.observedAt === undefined ||
    usage.windows.length === 0
  )
    return 'unavailable';
  if (
    now - usage.observedAt > 5 * 60_000 ||
    usage.windows.some((w) => w.resetsAt !== undefined && now >= w.resetsAt)
  )
    return 'stale';
  return 'live';
}
export function attentionEvents(previous: Snapshot, next: Snapshot): Session[] {
  // Startup/reconnect snapshots must be handled separately; never replay historic alerts.
  const old = new Map(previous.sessions.map((s) => [s.id, s]));
  return next.sessions.filter((s) => {
    const before = old.get(s.id);
    return (
      s.health === 'live' &&
      ['approval', 'input', 'failed', 'responded'].includes(s.activity) &&
      (!before || (s.observedAt > before.observedAt && s.activity !== before.activity))
    );
  });
}
