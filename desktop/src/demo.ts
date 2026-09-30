import type { Snapshot } from '../../contracts/src';

export function demoSnapshot(): Snapshot {
  const now = Date.now();
  return {
    bridgeWindows: 2,
    sessions: [
      {
        id: 'claude:1',
        provider: 'claude',
        project: 'glim',
        activity: 'approval',
        observedAt: now,
        health: 'live',
        contextPercent: 38,
      },
      {
        id: 'codex:2',
        provider: 'codex',
        project: 'portfolio',
        activity: 'working',
        observedAt: now - 8000,
        health: 'live',
        contextPercent: 24,
      },
      {
        id: 'claude:3',
        provider: 'claude',
        project: 'design-system',
        activity: 'tool',
        observedAt: now - 3000,
        health: 'live',
        contextPercent: 61,
      },
      {
        id: 'codex:4',
        provider: 'codex',
        project: 'api-service',
        activity: 'working',
        observedAt: now - 6000,
        health: 'live',
        contextPercent: 17,
      },
      {
        id: 'claude:5',
        provider: 'claude',
        project: 'docs',
        activity: 'responded',
        observedAt: now - 25_000,
        health: 'live',
        contextPercent: 12,
      },
      {
        id: 'codex:6',
        provider: 'codex',
        project: 'playground',
        activity: 'ready',
        observedAt: now - 40_000,
        health: 'live',
        contextPercent: 9,
      },
    ],
    accounts: [
      {
        provider: 'claude',
        availability: 'available',
        observedAt: now,
        windows: [
          { label: '5 hours', usedPercent: 42, resetsAt: now + 130 * 60_000 },
          { label: '7 days', usedPercent: 28, resetsAt: now + 3 * 86_400_000 },
        ],
      },
      {
        provider: 'codex',
        availability: 'available',
        observedAt: now,
        windows: [
          { label: '5 hours', usedPercent: 18, resetsAt: now + 210 * 60_000 },
          { label: '7 days', usedPercent: 56, resetsAt: now + 5 * 86_400_000 },
        ],
      },
    ],
  };
}
export const emptySnapshot: Snapshot = {
  sessions: [],
  bridgeWindows: 0,
  accounts: [
    {
      provider: 'claude',
      availability: 'unavailable',
      windows: [],
      reason: 'Usage integration is not connected yet.',
    },
    {
      provider: 'codex',
      availability: 'unavailable',
      windows: [],
      reason: 'Usage integration is not connected yet.',
    },
  ],
};
