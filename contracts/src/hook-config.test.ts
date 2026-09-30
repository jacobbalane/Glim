import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planHookInstall, planHookRemoval, type HookAddition } from './hook-config.ts';

const addition: HookAddition = {
  event: 'Stop',
  group: {
    hooks: [{ type: 'command', command: 'C:/Glim/glim-relay.exe', args: ['claude'], timeout: 3 }],
  },
};
test('install preserves user hooks, status line and unrelated fields without mutating input', () => {
  const original = {
    hooks: { Stop: [{ hooks: [{ type: 'command', command: 'my-existing-hook' }] }] },
    statusLine: { type: 'command', command: 'my-status-line' },
    env: { EXAMPLE: 'private-value' },
  };
  const baseline = structuredClone(original);
  const plan = planHookInstall(original, [addition]);
  assert.deepEqual(original, baseline);
  assert.deepEqual(plan.config.statusLine, original.statusLine);
  assert.deepEqual(plan.config.env, original.env);
  assert.deepEqual(planHookRemoval(plan.config, plan.receipt).config, original);
});
test('reinstallation is idempotent and uninstall removes only owned entries', () => {
  const first = planHookInstall({}, [addition]);
  const second = planHookInstall(first.config, [addition], first.receipt);
  assert.deepEqual(first.config, second.config);
  assert.equal(second.receipt.entries.length, 1);
  assert.deepEqual(planHookRemoval(second.config, second.receipt).config, {});
});
test('edited or duplicated entries remain untouched during removal', () => {
  const plan = planHookInstall({}, [addition]);
  const edited = structuredClone(plan.config) as { hooks: { Stop: (typeof addition.group)[] } };
  edited.hooks.Stop[0].hooks[0].timeout = 20;
  const result = planHookRemoval(edited, plan.receipt);
  assert.equal(result.removed, 0);
  assert.equal(result.preserved, 1);
  assert.deepEqual(result.config, edited);
  const duplicated = { hooks: { Stop: [addition.group, addition.group] } };
  assert.deepEqual(planHookRemoval(duplicated, plan.receipt).config, duplicated);
});
test('a preexisting identical hook is never claimed as owned by Glim', () => {
  const original = { hooks: { Stop: [addition.group] } };
  const plan = planHookInstall(original, [addition]);
  assert.equal(plan.receipt.entries.length, 0);
  assert.deepEqual(planHookRemoval(plan.config, plan.receipt).config, original);
});
test('unsupported configuration fails closed instead of replacing existing settings', () => {
  for (const config of [null, [], { hooks: [] }, { hooks: { Stop: 'invalid' } }]) {
    assert.throws(() => planHookInstall(config, [addition]));
  }
});
