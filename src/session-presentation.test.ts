import { describe, it, expect } from 'vitest';
import {
  attentionKind,
  attentionSummary,
  rotationGroups,
  statusLabel,
} from './session-presentation';
import { previewSessions } from './preview';

describe('session preview attention', () => {
  it('distinguishes questions, approvals and a completed turn without ending a session', () => {
    const now = Date.now();
    const question = {
      ...previewSessions[0],
      activity: 'waiting' as const,
      detail: 'Waiting for your answer',
    };
    const completed = {
      ...previewSessions[0],
      activity: 'idle' as const,
      detail: 'Turn finished',
      updatedAt: now,
    };
    expect(attentionKind(question, now)).toBe('answer');
    expect(statusLabel(question)).toBe('Answer needed');
    expect(statusLabel(completed)).toBe('Done');
    expect(
      attentionSummary([question, previewSessions[1], completed], now).map((item) => item.text),
    ).toEqual(['1 needs approval', '1 needs an answer', '1 done']);
    expect(attentionKind(completed, now + 11 * 60 * 1000)).toBeNull();
  });
  it('keeps working sessions separate from attention and does not rotate old completions', () => {
    const now = Date.now();
    const old = {
      ...previewSessions[0],
      id: 'old',
      activity: 'finished' as const,
      updatedAt: now - 60 * 60 * 1000,
    };
    const groups = rotationGroups([...previewSessions, old], now);
    expect(groups.working.map((session) => session.id)).toEqual(['demo-claude']);
    expect(groups.other.some((session) => session.id === 'demo-codex')).toBe(true);
    expect(groups.other.some((session) => session.id === 'old')).toBe(false);
  });
});
