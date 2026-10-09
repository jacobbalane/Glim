import { useEffect, useRef, useState } from 'react';
import { attentionKind, PREVIEW_INTERVAL, rotationGroups } from './session-presentation';
import type { Session } from './types';

// Only the compact glance rotates. Reading an expanded session never moves its selection.
export default function useSessionPreview(
  sessions: Session[],
  {
    enabled,
    held,
    initialId,
    dwell,
  }: { enabled: boolean; held: boolean; initialId?: string | null; dwell: number },
) {
  const [id, setId] = useState(initialId ?? null);
  const current = useRef(id);
  const latest = useRef(sessions);
  latest.current = sessions;
  const known = useRef<Map<string, string | null> | null>(null);
  const queue = useRef<string[]>([]);
  const deadline = useRef(Date.now() + PREVIEW_INTERVAL);
  const priorityUntil = useRef(0);
  const shownAt = useRef(Date.now());
  const cursors = useRef({ working: 0, other: 0, turn: 0 });

  useEffect(() => {
    if (!sessions.length && known.current === null) return;
    const next = new Map(
      sessions.map((session) => [session.id, attentionKind(session, Date.now())]),
    );
    if (known.current) {
      for (const [sessionId, kind] of next) {
        if (kind && known.current.get(sessionId) !== kind && !queue.current.includes(sessionId))
          queue.current.push(sessionId);
      }
    }
    known.current = next;
    if (!sessions.some((session) => session.id === current.current)) {
      const groups = rotationGroups(sessions, Date.now());
      const first = groups.working[0] ?? groups.other[0];
      current.current = first?.id ?? null;
      setId(current.current);
    }
  }, [sessions]);

  useEffect(() => {
    deadline.current = Math.max(deadline.current, shownAt.current + dwell);
  }, [dwell, id]);

  useEffect(() => {
    if (!enabled || held) return;
    deadline.current = Date.now() + Math.max(PREVIEW_INTERVAL, dwell);
    const timer = setInterval(() => {
      if (document.hidden) {
        deadline.current = Date.now() + PREVIEW_INTERVAL;
        return;
      }
      const now = Date.now();
      if (now < priorityUntil.current) return;
      let next: Session | undefined;
      while (queue.current.length && !next) {
        const queued = queue.current.shift();
        next = latest.current.find(
          (session) => session.id === queued && attentionKind(session, now),
        );
      }
      if (next) priorityUntil.current = now + PREVIEW_INTERVAL;
      else {
        if (now < deadline.current) return;
        const { working, other } = rotationGroups(latest.current, now);
        const showOther = other.length > 0 && (!working.length || cursors.current.turn % 3 === 2);
        const pool = showOther ? other : working;
        const key = showOther ? 'other' : 'working';
        const index = pool.findIndex((session) => session.id === current.current);
        next = pool[(index >= 0 ? index + 1 : cursors.current[key]) % pool.length];
        cursors.current[key]++;
        cursors.current.turn++;
      }
      if (next) {
        current.current = next.id;
        setId(next.id);
        shownAt.current = now;
        deadline.current = now + PREVIEW_INTERVAL;
      }
    }, 250);
    return () => clearInterval(timer);
    // Dwell changes extend the current reading window without restarting the rotation clock.
  }, [enabled, held]);
  return sessions.find((session) => session.id === id) ?? sessions[0];
}
