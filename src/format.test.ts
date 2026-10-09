import { describe, expect, it } from 'vitest';
import { totalTokens, rankSessions } from './format';
import { previewSessions } from './preview';

describe('usage and attention ordering', () => {
  it('does not count cached reads or reasoning twice', () => {
    expect(
      totalTokens({ input: 1000, output: 200, cached: 800, cacheWrite: 50, reasoning: 100 }),
    ).toBe(1250);
    expect(totalTokens(null)).toBeNull();
  });
  it('prioritizes approvals while preserving original session data', () => {
    const ranked = rankSessions(previewSessions);
    expect(ranked[0].activity).toBe('waiting');
    expect(previewSessions[0].activity).toBe('working');
  });
});
