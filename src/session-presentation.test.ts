import { describe, expect, it } from 'vitest';
import {
  attentionKind,
  byProject,
  groupSessions,
  isNotice,
  lookOf,
  nameOf,
  notchView,
} from './session-presentation';
import { previewSessions } from './preview';
import type { Session } from './types';

const now = 1_000_000;
const session = (patch: Partial<Session> = {}): Session => ({
  ...structuredClone(previewSessions[0]),
  updatedAt: now,
  ...patch,
});

describe('session presentation', () => {
  it('reads a usage limit as Limit reached: a notice of its own, not Your turn or an error', () => {
    const limited = session({ activity: 'limited', detail: 'Usage limit reached' });
    expect(lookOf(limited, now - 1)).toMatchObject({ label: 'Limit reached', tone: 'limit' });
    // Seen or not, it stays until the agent works again.
    expect(lookOf(limited, now + 1).label).toBe('Limit reached');
    expect(attentionKind(limited, now, now + 1)).toBe('limit');
    const [group] = groupSessions([limited], now + 1);
    expect(isNotice(group, now + 1, now)).toBe(true);
    // After a question or an error, before a finished turn.
    const order = groupSessions(
      [
        session({ id: 'turn', activity: 'idle', detail: 'Turn finished' }),
        session({ id: 'limit', activity: 'limited' }),
        session({ id: 'error', activity: 'error' }),
        session({ id: 'ask', activity: 'waiting' }),
      ],
      now - 1,
    );
    expect(order.map((g) => g.session.id)).toEqual(['ask', 'error', 'limit', 'turn']);
  });
  it('groups subagents under their parent and sorts top-level sessions by urgency', () => {
    const groups = groupSessions(
      [
        session({ id: 'parent', project: 'Zebra' }),
        session({ id: 'child', parentId: 'parent', activity: 'waiting' }),
        session({ id: 'blocked', activity: 'waiting' }),
        session({ id: 'orphan', parentId: 'missing', activity: 'error' }),
      ],
      now,
    );
    expect(groups.map((g) => g.session.id)).toEqual(['blocked', 'orphan', 'parent']);
    expect(groups[2].children.map((s) => s.id)).toEqual(['child']);
  });
  it('names each agent by project and agent, and gathers each project', () => {
    const groups = groupSessions(
      [
        session({ id: 'a', project: 'Glim', provider: 'claude', startedAt: 1 }),
        session({ id: 'b', project: 'Glim', provider: 'codex', startedAt: 2 }),
        session({ id: 'c', project: 'glim', provider: 'claude', startedAt: 3 }),
        session({ id: 'd', project: 'api-service', provider: 'claude', startedAt: 4 }),
        // Ended, and still shown for a moment: the open one is not "Claude 2" because of it.
        session({
          id: 'e',
          project: 'api-service',
          provider: 'claude',
          startedAt: 0,
          activity: 'finished',
        }),
      ],
      now,
    );
    expect(Object.fromEntries(groups.map((g) => [g.session.id, nameOf(g)]))).toEqual({
      a: 'Glim · Claude',
      b: 'Glim · Codex',
      c: 'glim · Claude 2',
      d: 'api-service · Claude',
      e: 'api-service · Claude',
    });
    expect(byProject(groups).map((p) => p.map((g) => g.session.id).sort())).toEqual([
      ['a', 'b', 'c'],
      ['d', 'e'],
    ]);
  });
  it('shows a just-started session as Ready, and only a finished turn as Your turn', () => {
    const fresh = session({ activity: 'idle', detail: 'Ready for your next idea' });
    expect(lookOf(fresh, now - 1).label).toBe('Ready');
    expect(attentionKind(fresh, now, now - 1)).toBeNull();
    const handedBack = session({ activity: 'idle', detail: 'Turn finished' });
    expect(lookOf(handedBack, now - 1).label).toBe('Your turn');
    expect(attentionKind(handedBack, now, now - 1)).toBe('done');
  });
  it('distinguishes questions, approval and a general attention request', () => {
    const s = session({ activity: 'waiting', detail: 'Waiting for your answer' });
    expect(attentionKind(s, now)).toBe('answer');
    expect(lookOf(s, now).label).toBe('Needs an answer');
    expect(lookOf({ ...s, detail: 'Waiting for approval' }, now).label).toBe('Needs approval');
    expect(lookOf({ ...s, detail: 'Agent needs your attention' }, now).label).toBe('Needs you');
  });
  it('acknowledges handed-back turns only when the UI has seen them', () => {
    const s = session({ activity: 'idle' });
    expect(lookOf(s, now - 1).label).toBe('Your turn');
    expect(lookOf(s, now).label).toBe('Ready');
    expect(attentionKind(s, now, now)).toBeNull();
    expect(lookOf(s, Infinity).label).toBe('Ready');
  });
  it('expires completion notices after ten minutes, but retains interruptions until seen', () => {
    const [done] = groupSessions([session({ activity: 'finished' })], now - 1);
    expect(isNotice(done, now - 1, now + 599_999)).toBe(true);
    expect(isNotice(done, now - 1, now + 600_000)).toBe(false);
    const [interrupted] = groupSessions([session({ activity: 'interrupted' })], now - 1);
    expect(isNotice(interrupted, now - 1, now + 900_000)).toBe(true);
    expect(isNotice(interrupted, now, now + 900_000)).toBe(false);
  });
  it('presents a notice once, then keeps it docked while working agents rotate by project', () => {
    const groups = groupSessions(
      [
        session({ id: 'z', project: 'Zebra' }),
        session({ id: 'a', project: 'Alpha' }),
        session({ id: 'notice', activity: 'waiting' }),
      ],
      now,
    );
    expect(notchView(groups, now, now, 0, 'notice', new Set()).current?.session.id).toBe('notice');
    const docked = new Set(['notice']);
    for (let i = 0; i < 9; i++) {
      const view = notchView(groups, now, now, i, null, docked);
      expect(view.current?.session.id).toBe(i % 2 ? 'z' : 'a');
      expect(view.inbox.map((g) => g.session.id)).toEqual(['notice']);
    }
  });
  it('rests on the most urgent notice when nobody is working, without duplicating it', () => {
    const groups = groupSessions(
      [session({ id: 'error', activity: 'error' }), session({ id: 'wait', activity: 'waiting' })],
      now,
    );
    const view = notchView(groups, now, now);
    expect(view.current?.session.id).toBe('wait');
    expect(view.inbox.map((g) => g.session.id)).toEqual(['error']);
  });
});
