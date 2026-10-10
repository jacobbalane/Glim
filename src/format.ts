import type { Session, Tokens } from './types';
// Input as the agents count it includes what was read from cache. Glim shows that apart and keeps
// it out of the total: a long Claude Code session re-reads its context on every turn, and those
// cheap reads would otherwise swamp the real input.
export function freshInput(t: Pick<Tokens, 'input' | 'cached'>) {
  return Math.max(0, t.input - t.cached);
}
export function totalTokens(t: Tokens | null) {
  return t ? freshInput(t) + t.output + t.cacheWrite : null;
}
export function compactNumber(value: number | null) {
  if (value === null) return '—';
  return new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(
    value,
  );
}
export function elapsed(from: number, now = Date.now()) {
  const seconds = Math.max(0, Math.floor((now - from) / 1000));
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600)
    return `${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, '0')}s`;
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
}
export function rankSessions(sessions: Session[]) {
  const weight = {
    waiting: 0,
    error: 1,
    working: 2,
    interrupted: 3,
    idle: 4,
    stale: 5,
    finished: 6,
  };
  return [...sessions].sort(
    (a, b) => weight[a.activity] - weight[b.activity] || b.updatedAt - a.updatedAt,
  );
}
export function isActive(session: Session) {
  return ['working', 'waiting'].includes(session.activity);
}
