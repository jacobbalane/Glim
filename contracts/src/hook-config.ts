import { createHash } from 'node:crypto';

type Json = null | string | number | boolean | Json[] | { [key: string]: Json };
export type HookGroup = { hooks: Record<string, Json>[]; matcher?: string };
export interface HookAddition {
  event: string;
  group: HookGroup;
}
export interface HookReceipt {
  version: 1;
  entries: HookAddition[];
  hadHooksKey: boolean;
}

function object(value: unknown): value is Record<string, Json> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function canonical(value: Json): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (object(value))
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`)
      .join(',')}}`;
  return JSON.stringify(value);
}
function digest(group: Json): string {
  return createHash('sha256').update(canonical(group)).digest('hex');
}
function validate(config: unknown): asserts config is Record<string, Json> {
  if (!object(config)) throw new Error('Expected a JSON configuration object.');
  if ('hooks' in config && !object(config.hooks))
    throw new Error('Existing hooks configuration is not an object; leave it unchanged.');
  if (object(config.hooks)) {
    for (const value of Object.values(config.hooks)) {
      if (
        !Array.isArray(value) ||
        !value.every((group) => object(group) && Array.isArray(group.hooks))
      ) {
        throw new Error('Unrecognized hook configuration; leave it unchanged.');
      }
    }
  }
}
function hooksOf(config: Record<string, Json>): Record<string, Json[]> {
  return (config.hooks ?? {}) as Record<string, Json[]>;
}

// Pure planning only. A future installer writes the result atomically after checking
// the on-disk config still matches its input, then stores the receipt privately.
export function planHookRemoval(input: unknown, receipt: HookReceipt) {
  validate(input);
  if (receipt.version !== 1) throw new Error('Unsupported hook receipt version.');
  const config = structuredClone(input);
  const hooks = hooksOf(config);
  let removed = 0;
  let preserved = 0;
  for (const entry of receipt.entries) {
    const groups = hooks[entry.event];
    if (!Array.isArray(groups)) {
      preserved++;
      continue;
    }
    const matches = groups
      .map((group, index) => (digest(group) === digest(entry.group) ? index : -1))
      .filter((index) => index >= 0);
    // A duplicate or edited group has ambiguous ownership. Never remove it by command prefix.
    if (matches.length !== 1) {
      preserved++;
      continue;
    }
    groups.splice(matches[0], 1);
    if (groups.length === 0) delete hooks[entry.event];
    removed++;
  }
  if (!receipt.hadHooksKey && Object.keys(hooks).length === 0) delete config.hooks;
  return { config, removed, preserved };
}

export function planHookInstall(input: unknown, additions: HookAddition[], previous?: HookReceipt) {
  validate(input);
  const removal = previous ? planHookRemoval(input, previous) : undefined;
  const config = removal?.config ?? structuredClone(input);
  const hadHooksKey = 'hooks' in config;
  const hooks = hooksOf(config);
  const entries: HookAddition[] = [];
  for (const addition of additions) {
    if (
      !/^[A-Z][A-Za-z]+$/.test(addition.event) ||
      !Array.isArray(addition.group.hooks) ||
      addition.group.hooks.length === 0
    ) {
      throw new Error('Invalid hook addition.');
    }
    const groups = hooks[addition.event] ?? [];
    if (groups.some((group) => digest(group) === digest(addition.group))) continue;
    const group = structuredClone(addition.group);
    hooks[addition.event] = [...groups, group];
    entries.push({ event: addition.event, group: structuredClone(group) });
  }
  if (Object.keys(hooks).length || hadHooksKey) config.hooks = hooks;
  return {
    config,
    receipt: { version: 1 as const, hadHooksKey, entries },
    preservedModifiedEntries: removal?.preserved ?? 0,
  };
}
