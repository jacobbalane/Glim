import {
  DEFAULT_PREFERENCES,
  type Connector,
  type DailyUsage,
  type Session,
  type Snapshot,
} from './types';

const now = Date.now();
export const previewSessions: Session[] = [
  {
    id: 'demo-claude',
    provider: 'claude',
    parentId: null,
    project: 'glim-desktop',
    model: 'Claude Opus',
    activity: 'working',
    detail: 'Editing files',
    startedAt: now - 312000,
    updatedAt: now,
    tokens: { input: 48200, output: 8400, cached: 36100, cacheWrite: 2700, reasoning: 0 },
    contextPercent: 38,
    tasks: [
      { id: '1', label: 'Build the desktop shell', status: 'completed' },
      { id: '2', label: 'Connect agent events', status: 'completed' },
      { id: '3', label: 'Polish the island', status: 'in_progress' },
      { id: '4', label: 'Verify the installer', status: 'pending' },
    ],
    limits: [{ label: '5 hour', usedPercent: 24, resetsAt: now + 7200000 }],
    source: 'Preview data',
    measurementNote: null,
  },
  {
    id: 'demo-codex',
    provider: 'codex',
    parentId: null,
    project: 'api-service',
    model: 'GPT Codex',
    activity: 'waiting',
    detail: 'Waiting for approval',
    startedAt: now - 184000,
    updatedAt: now - 5000,
    tokens: { input: 29100, output: 4200, cached: 19300, cacheWrite: 0, reasoning: 1200 },
    contextPercent: 21,
    tasks: [],
    limits: [],
    source: 'Preview data',
    measurementNote: null,
  },
  {
    id: 'demo-claude-2',
    provider: 'claude',
    parentId: null,
    project: 'design-system',
    model: 'Claude Sonnet',
    activity: 'idle',
    detail: 'Turn finished',
    startedAt: now - 1240000,
    updatedAt: now - 80000,
    tokens: { input: 18900, output: 2100, cached: 14200, cacheWrite: 500, reasoning: 0 },
    contextPercent: 14,
    tasks: [],
    limits: [],
    source: 'Preview data',
    measurementNote: null,
  },
];
export const previewConnectors: Connector[] = (['claude', 'codex'] as const).map((provider) => ({
  provider,
  detected: true,
  enabled: true,
  version: provider === 'claude' ? '2.1.289' : '0.161.0',
  configPath: provider === 'claude' ? '~/.claude/settings.json' : '~/.codex/hooks.json',
  changes: [
    'Add Glim lifecycle hooks',
    ...(provider === 'claude' ? ['Relay usage through the status line'] : []),
  ],
  note:
    provider === 'codex'
      ? 'Review the Glim hooks with /hooks, then start a new session.'
      : 'Start a new session after enabling the connector.',
  error: null,
}));
// The main browser demo and Reset share the larger sample. Gallery scenes can
// opt into it while keeping their focused three-session fixtures by default.
export function previewSnapshot({ mixedStatuses = true } = {}): Snapshot {
  const snapshot: Snapshot = {
    sessions: structuredClone(previewSessions),
    preferences: { ...DEFAULT_PREFERENCES, onboardingComplete: true },
    connectors: structuredClone(previewConnectors),
  };
  if (mixedStatuses) {
    const now = Date.now();
    const completed = snapshot.sessions.find((s) => s.id === 'demo-claude-2')!;
    completed.activity = 'finished';
    completed.detail = 'Component audit complete';
    completed.tasks = [{ id: 'audit', label: 'Audit the shared components', status: 'completed' }];
    const extra: (Pick<Session, 'id' | 'project' | 'provider' | 'activity' | 'detail'> & {
      age: number;
    })[] = [
      {
        id: 'demo-web-client',
        project: 'web-client',
        provider: 'claude',
        activity: 'waiting',
        detail: 'Approve dependency installation',
        age: 55_000,
      },
      {
        id: 'demo-release-tools',
        project: 'release-tools',
        provider: 'codex',
        activity: 'waiting',
        detail: 'Approve the release build command',
        age: 128_000,
      },
      {
        id: 'demo-docs-site',
        project: 'docs-site',
        provider: 'codex',
        activity: 'finished',
        detail: 'Installation guide updated',
        age: 40_000,
      },
      {
        id: 'demo-payments-api',
        project: 'payments-api',
        provider: 'claude',
        activity: 'error',
        detail: 'Payment integration tests failed',
        age: 15_000,
      },
      {
        id: 'demo-worker-queue',
        project: 'worker-queue',
        provider: 'codex',
        activity: 'error',
        detail: 'Could not connect to the test database',
        age: 45_000,
      },
    ];
    snapshot.sessions.push(
      ...extra.map(({ age, ...session }) => ({
        ...structuredClone(snapshot.sessions.find((s) => s.provider === session.provider)!),
        ...session,
        startedAt: now - age - 240_000,
        updatedAt: now - age,
        tasks:
          session.activity === 'finished'
            ? [{ id: 'docs', label: 'Update the installation guide', status: 'completed' as const }]
            : [],
        limits: [],
      })),
    );
  }
  return snapshot;
}
export const previewHistory: DailyUsage[] = Array.from({ length: 14 }, (_, i) => {
  const day = new Date(now - (13 - i) * 86400000).toISOString().slice(0, 10);
  return (['claude', 'codex'] as const).map((provider, p) => ({
    day,
    provider,
    project: p ? 'api-service' : 'glim-desktop',
    input: [21000, 42000, 18000, 64000, 37000, 92000, 51000][i % 7] * (p ? 0.6 : 1),
    output: 2000 + i * 530,
    cached: 8000 + i * 700,
    cacheWrite: p ? 0 : 1200,
    reasoning: p ? 400 : 0,
    sessions: 2 + (i % 4),
  }));
}).flat();
