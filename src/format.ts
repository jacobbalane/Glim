import type { Session, Tokens } from './types';
export function totalTokens(t: Tokens | null) {
  return t ? t.input + t.output + t.cacheWrite : null;
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
