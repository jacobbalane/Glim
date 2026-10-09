import type { Session } from './types';

export const PREVIEW_INTERVAL = 6000;
const COMPLETION_WINDOW = 10 * 60 * 1000;
export type Attention = 'approval' | 'answer' | 'attention' | 'done' | 'error';

export function isComplete(session: Session) {
  return (
    session.activity === 'finished' ||
    (session.activity === 'idle' && /turn finished/i.test(session.detail))
  );
}

export function attentionKind(session: Session, now: number): Attention | null {
  if (session.activity === 'waiting') {
    if (/answer|question|input/i.test(session.detail)) return 'answer';
    if (/approval|permission/i.test(session.detail)) return 'approval';
    return 'attention';
  }
  if (session.activity === 'error') return 'error';
  if (isComplete(session) && now - session.updatedAt < COMPLETION_WINDOW) return 'done';
  return null;
}

export function attentionSummary(sessions: Session[], now: number) {
  const counts = { approval: 0, answer: 0, attention: 0, done: 0, error: 0 };
  for (const session of sessions) {
    const kind = attentionKind(session, now);
    if (kind) counts[kind]++;
  }
  const labels: Record<Attention, string> = {
    approval: 'need approval',
    answer: 'need an answer',
    attention: 'need attention',
    done: 'done',
    error: 'with errors',
  };
  return (Object.keys(counts) as Attention[])
    .filter((kind) => counts[kind] > 0)
    .map((kind) => ({
      kind,
      count: counts[kind],
      text: `${counts[kind]} ${counts[kind] === 1 ? labels[kind].replace(/^need /, 'needs ') : labels[kind]}`,
    }));
}

export function statusLabel(session: Session, paused = false) {
  if (paused) return 'Paused';
  if (isComplete(session)) return 'Done';
  if (session.activity === 'waiting' && /answer|question|input/i.test(session.detail))
    return 'Answer needed';
  return {
    working: 'Working',
    waiting: 'Approval needed',
    idle: 'Ready',
    finished: 'Done',
    interrupted: 'Interrupted',
    error: 'Error',
    stale: 'No recent activity',
  }[session.activity];
}

export function statusTone(session: Session, paused = false) {
  return paused ? 'paused' : isComplete(session) ? 'finished' : session.activity;
}

export function previewText(session: Session | undefined, paused: boolean, multiple: boolean) {
  if (paused) return 'Paused';
  if (!session) return 'No active agents';
  const detail = session.detail || statusLabel(session);
  return multiple ? `${session.project} · ${detail}` : detail;
}

export function rotationGroups(sessions: Session[], now: number) {
  const stable = [...sessions].sort((a, b) => a.id.localeCompare(b.id));
  const working = stable.filter((session) => session.activity === 'working');
  const other = stable.filter(
    (session) =>
      session.activity !== 'working' &&
      (attentionKind(session, now) ||
        (session.activity === 'idle' && !isComplete(session)) ||
        session.activity === 'interrupted'),
  );
  return { working, other: other.length ? other : working.length ? [] : stable };
}
