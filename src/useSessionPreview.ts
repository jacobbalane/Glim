import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { holdOf, isNotice, notchView, PREVIEW_INTERVAL, type Group } from './session-presentation';

// Keep notice delivery separate from the working rotation. Nothing here opens the island.
export default function useSessionPreview(
  groups: Group[],
  seenAt: number,
  {
    enabled,
    held,
    dwell,
    ready,
  }: { enabled: boolean; held: boolean; dwell: number; ready: boolean },
) {
  const [, redraw] = useState(0);
  const latest = useRef({ groups, enabled, held, dwell, seenAt });
  latest.current = { groups, enabled, held, dwell, seenAt };
  const state = useRef({
    known: null as Map<string, string> | null,
    queue: [] as string[],
    presenting: null as { id: string; remaining: number } | null,
    docked: new Set<string>(),
    rotation: 0,
    remaining: PREVIEW_INTERVAL,
    dwell: PREVIEW_INTERVAL,
  });
  const presentNext = () => {
    const s = state.current,
      all = latest.current.groups;
    s.queue.sort(
      (a, b) => all.findIndex((g) => g.session.id === a) - all.findIndex((g) => g.session.id === b),
    );
    const id = s.queue.shift();
    const group = all.find((g) => g.session.id === id);
    if (id && group) s.presenting = { id, remaining: holdOf(group.session) };
  };
  const now = Date.now();
  const keys = groups
    .filter((g) => isNotice(g, seenAt, now))
    .map((g) => `${g.session.id}:${g.session.activity}:${g.session.updatedAt}`)
    .join('|');
  useLayoutEffect(() => {
    if (!ready) return;
    const s = state.current;
    const next = new Map(
      latest.current.groups
        .filter((g) => isNotice(g, seenAt, Date.now()))
        .map((g) => [g.session.id, `${g.session.activity}:${g.session.updatedAt}`]),
    );
    if (!s.known) next.forEach((_, id) => s.docked.add(id));
    else
      next.forEach((key, id) => {
        if (s.known!.get(id) === key || s.queue.includes(id)) return;
        if (s.presenting?.id === id) {
          s.presenting.remaining = holdOf(
            latest.current.groups.find((g) => g.session.id === id)!.session,
          );
          return;
        }
        s.docked.delete(id);
        s.queue.push(id);
      });
    for (const id of s.docked) if (!next.has(id)) s.docked.delete(id);
    s.queue = s.queue.filter((id) => next.has(id));
    if (s.presenting && !next.has(s.presenting.id)) s.presenting = null;
    s.known = next;
    if (latest.current.enabled && !document.hidden && !s.presenting && s.queue.length)
      presentNext();
    redraw((n) => n + 1);
  }, [keys, seenAt, ready]);
  useEffect(() => {
    const s = state.current;
    s.remaining += Math.max(0, dwell - s.dwell);
    s.dwell = dwell;
  }, [dwell]);
  useEffect(() => {
    if (!enabled || !ready) return;
    let previous = Date.now();
    const visible = () => {
      previous = Date.now();
    };
    document.addEventListener('visibilitychange', visible);
    const timer = setInterval(() => {
      const at = Date.now(),
        delta = at - previous;
      previous = at;
      if (document.hidden) return;
      const s = state.current,
        current = latest.current;
      if (s.presenting) {
        if (current.held) return;
        s.presenting.remaining -= delta;
        if (s.presenting.remaining > 0) return;
        s.docked.add(s.presenting.id);
        s.presenting = null;
        s.remaining = current.dwell;
      }
      if (s.queue.length) presentNext();
      else if (!current.held) {
        s.remaining -= delta;
        if (s.remaining <= 0) {
          const count = current.groups.filter((g) => g.session.activity === 'working').length;
          if (count > 1) s.rotation = (s.rotation + 1) % count;
          s.remaining = current.dwell;
        }
      }
      redraw((n) => n + 1);
    }, 250);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', visible);
    };
  }, [enabled, ready]);
  const s = state.current;
  return notchView(groups, seenAt, now, s.rotation, s.presenting?.id ?? null, s.docked);
}
