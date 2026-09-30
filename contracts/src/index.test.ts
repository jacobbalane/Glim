import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  attentionEvents,
  summarize,
  usageFreshness,
  type Session,
  type Snapshot,
  type AccountUsage,
} from './index.ts';
const session: Session = {
  id: 'codex:a',
  provider: 'codex',
  project: 'glim',
  activity: 'working',
  health: 'live',
  observedAt: 100,
};
const snapshot = (sessions: Session[]): Snapshot => ({ sessions, accounts: [], bridgeWindows: 0 });
test('quiet or disconnected sessions are never counted as actively working', () => {
  assert.deepEqual(
    summarize([
      session,
      { ...session, id: 'b', health: 'stale' },
      { ...session, id: 'c', activity: 'closed' },
    ]),
    { total: 2, working: 1, attention: 0, unverified: 1 },
  );
});
test('repeated snapshots do not repeat attention, but a later new approval does', () => {
  const approval = { ...session, activity: 'approval' as const, observedAt: 200 };
  assert.equal(attentionEvents(snapshot([session]), snapshot([approval])).length, 1);
  assert.equal(attentionEvents(snapshot([approval]), snapshot([approval])).length, 0);
  assert.equal(
    attentionEvents(snapshot([session]), snapshot([{ ...approval, health: 'stale' }])).length,
    0,
  );
});
test('crossed quota reset time marks the last reading stale without inventing a new value', () => {
  const quota: AccountUsage = {
    provider: 'codex',
    availability: 'available',
    observedAt: 100,
    windows: [{ label: '5 hours', usedPercent: 78, resetsAt: 200 }],
  };
  assert.equal(usageFreshness(quota, 150), 'live');
  assert.equal(usageFreshness(quota, 200), 'stale');
  assert.equal(quota.windows[0].usedPercent, 78);
  assert.equal(usageFreshness({ ...quota, windows: [] }, 150), 'unavailable');
});
