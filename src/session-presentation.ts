import { PROVIDERS, type Session } from './types';
import type { Tone, Mood } from './Character';
import { elapsed } from './format';

export interface Look {
  label: string;
  tone: Tone;
  mood: Mood;
  rank: number;
}
export interface Group {
  session: Session;
  look: Look;
  children: Session[];
  // The agent's name in its project: Claude, Codex, or Claude 2 for a second Claude there.
  agent: string;
}
// What the island calls an agent: its project, then which agent it is there.
export const nameOf = (g: Group) => `${g.session.project} · ${g.agent}`;

// A session that has only just started has handed nothing back yet: it is Ready, not Your turn.
const FRESH = 'Ready for your next idea';

export function lookOf(s: Session, seenAt: number): Look {
  switch (s.activity) {
    case 'waiting':
      return {
        label: /answer|question|input/i.test(s.detail)
          ? 'Needs an answer'
          : s.detail === 'Agent needs your attention'
            ? 'Needs you'
            : 'Needs approval',
        tone: 'attention',
        mood: 'wide',
        rank: 0,
      };
    case 'error':
      return { label: 'Error', tone: 'error', mood: 'cross', rank: 1 };
    case 'idle':
      // A handed-back turn stays teal until the island is opened, then settles.
      return s.updatedAt > seenAt && s.detail !== FRESH
        ? { label: 'Your turn', tone: 'success', mood: 'happy', rank: 2 }
        : { label: 'Ready', tone: 'calm', mood: 'open', rank: 6 };
    case 'working':
      return { label: 'Working', tone: 'active', mood: 'scan', rank: 3 };
    case 'interrupted':
      return { label: 'Interrupted', tone: 'calm', mood: 'half', rank: 4 };
    case 'finished':
      return { label: 'Done', tone: 'done', mood: 'happy', rank: 5 };
    default:
      return { label: 'Quiet', tone: 'off', mood: 'closed', rank: 7 };
  }
}

// Each agent is named after its provider, with a number when that provider runs in the same
// folder more than once, counted in the order they started. Only open agents count: an ended one,
// still shown for a moment, never turns the next one into "Claude 2".
function agentNames(sessions: Session[]) {
  const folders = new Map<string, Session[]>();
  for (const s of sessions.filter((s) => s.activity !== 'finished')) {
    const key = s.project.toLowerCase();
    folders.set(key, [...(folders.get(key) ?? []), s]);
  }
  const names = new Map<string, string>();
  for (const twins of folders.values()) {
    const seen = new Map<string, number>();
    for (const s of [...twins].sort(
      (a, b) => a.startedAt - b.startedAt || (a.id < b.id ? -1 : 1),
    )) {
      const n = (seen.get(s.provider) ?? 0) + 1;
      seen.set(s.provider, n);
      names.set(s.id, `${PROVIDERS[s.provider].short}${n > 1 ? ` ${n}` : ''}`);
    }
  }
  return names;
}

// A subagent still at work. Finished ones, and ones gone quiet (often cancelled), are history.
export const isLive = (s: Session) => s.activity !== 'finished' && s.activity !== 'stale';

// Subagents fold into their parent; the most urgent agent always leads.
export function groupSessions(sessions: Session[], seenAt: number): Group[] {
  const ids = new Set(sessions.map((s) => s.id));
  const top = sessions.filter((s) => !s.parentId || !ids.has(s.parentId));
  const names = agentNames(top);
  return top
    .map((session) => ({
      session,
      look: lookOf(session, seenAt),
      children: sessions.filter((child) => child.parentId === session.id),
      agent: names.get(session.id) ?? PROVIDERS[session.provider].short,
    }))
    .sort((a, b) => a.look.rank - b.look.rank || b.session.updatedAt - a.session.updatedAt);
}

// The agents of each project folder together, the project with the most urgent agent first.
export function byProject(groups: Group[]) {
  const projects = new Map<string, Group[]>();
  for (const g of groups) {
    const key = g.session.project.toLowerCase();
    projects.set(key, [...(projects.get(key) ?? []), g]);
  }
  return [...projects.values()];
}

export function ago(ms: number) {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 5) return 'now';
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
  return `${Math.floor(s / 86400)}d ${Math.floor((s % 86400) / 3600)}h`;
}
export function timeOf(s: Session, now: number) {
  if (s.activity === 'working') return elapsed(s.startedAt, now);
  const since = ago(now - s.updatedAt);
  if (s.activity === 'waiting' || since === 'now') return since;
  return `${since} ago`;
}
/* ------------------------------------------------------------------ */
/* The notch: working agents take turns; anything else interrupts     */
/* once, then waits in the banner below until it is handled.           */
/* ------------------------------------------------------------------ */

export const PREVIEW_INTERVAL = 6000;
const DONE_WINDOW = 10 * 60 * 1000;
// Blocked and failed agents hold the notch longest; a stopped turn barely interrupts.
export function holdOf(s: Session) {
  if (s.activity === 'waiting' || s.activity === 'error') return 7000;
  return s.activity === 'interrupted' ? 3500 : 5000;
}
// Anything that is not working and worth knowing. Finished turns stop being news once seen.
export function isNotice(g: Group, seenAt: number, now: number) {
  const s = g.session;
  if (s.activity === 'waiting' || s.activity === 'error') return true;
  return attentionKind(s, now, seenAt) !== null;
}

export interface NotchView {
  current?: Group;
  mode: 'notice' | 'rotate' | 'rest';
  working: Group[];
  inbox: Group[];
}
// What the notch shows: a notice being presented, else the working agents in turn, else the
// most urgent thing at rest. The banner holds the docked notices the notch is not showing.
export function notchView(
  groups: Group[],
  seenAt: number,
  now: number,
  rotation = 0,
  presentingId: string | null = null,
  docked?: Set<string>,
): NotchView {
  const working = groups
    .filter((g) => g.session.activity === 'working')
    .sort((a, b) => a.session.project.localeCompare(b.session.project));
  const notices = groups.filter((g) => isNotice(g, seenAt, now));
  const presenting = notices.find((g) => g.session.id === presentingId);
  const isDocked = (g: Group) => !docked || docked.has(g.session.id);
  let current: Group | undefined;
  let mode: NotchView['mode'];
  if (presenting) {
    current = presenting;
    mode = 'notice';
  } else if (working.length) {
    current = working[rotation % working.length];
    mode = 'rotate';
  } else {
    current = notices.find(isDocked) ?? groups[0];
    mode = 'rest';
  }
  const inbox = notices.filter((g) => g !== current && isDocked(g));
  return { current, mode, working, inbox };
}

export function limitName(label: string) {
  if (label === '7 day') return 'Weekly limit';
  return /limit/i.test(label) ? label : `${label.replace(/^(\d+) (hour|day)$/, '$1-$2')} limit`;
}
export function plural(n: number, word: string) {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

export type Attention = 'approval' | 'answer' | 'attention' | 'done' | 'error' | 'interrupted';
export function attentionKind(s: Session, now: number, seenAt = -Infinity): Attention | null {
  if (s.activity === 'waiting')
    return /answer|question|input/i.test(s.detail)
      ? 'answer'
      : s.detail === 'Agent needs your attention'
        ? 'attention'
        : 'approval';
  if (s.activity === 'error') return 'error';
  if (s.updatedAt <= seenAt) return null;
  if (s.activity === 'interrupted') return 'interrupted';
  if (s.activity === 'idle' && s.detail === FRESH) return null;
  if ((s.activity === 'idle' || s.activity === 'finished') && now - s.updatedAt < DONE_WINDOW)
    return 'done';
  return null;
}
