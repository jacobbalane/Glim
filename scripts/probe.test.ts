import { test } from 'node:test';
import assert from 'node:assert/strict';
// @ts-expect-error JS utility is also runnable without a TS runtime.
import { sanitize } from './probe-codex.mjs';
test('account probe never emits email, auth tokens, credit identifiers or raw responses', () => {
  const result = sanitize(
    {
      account: {
        type: 'chatgpt',
        planType: 'plus',
        email: 'private@example.com',
        accessToken: 'SECRET',
      },
    },
    {
      rateLimits: {
        primary: { usedPercent: 21, windowDurationMins: 300, resetsAt: 123 },
        credits: { id: 'PRIVATE' },
      },
    },
  );
  assert.equal(result.windows[0].usedPercent, 21);
  assert.ok(!JSON.stringify(result).includes('SECRET'));
  assert.ok(!JSON.stringify(result).includes('private@example.com'));
  assert.ok(!JSON.stringify(result).includes('PRIVATE'));
  assert.deepEqual(sanitize({}, {}).windows, []);
});
