import { useEffect, useRef, useState } from 'react';
import type { NotchView } from './session-presentation';

// How long the list of notices under the island stays open once nothing holds it.
export const FOLD_MS = 8000;

// Notices docked under the island show as a list, then fold into a strip of colored dots once
// they have been on screen for FOLD_MS without the pointer or focus on the island. A notice that
// has just taken over the notch unfolds the list when it docks; notices that were already there,
// such as those Glim finds when it starts, stay folded.
export default function useNoticeFold(view: NotchView, held: boolean) {
  const [folded, setFolded] = useState(true);
  const [shown, setShown] = useState(0);
  const presented = useRef(new Set<string>());
  const known = useRef(new Set<string>());
  const ids = view.inbox.map((g) => g.session.id);
  const key = ids.join('|');
  if (view.mode === 'notice' && view.current) presented.current.add(view.current.session.id);
  useEffect(() => {
    const arrived = ids.some((id) => !known.current.has(id) && presented.current.has(id));
    known.current = new Set(ids);
    for (const id of ids) presented.current.delete(id);
    if (arrived) {
      setFolded(false);
      setShown((n) => n + 1);
    }
  }, [key]);
  useEffect(() => {
    if (folded || held || ids.length === 0) return;
    const timer = setTimeout(() => setFolded(true), FOLD_MS);
    return () => clearTimeout(timer);
  }, [folded, held, ids.length, shown]);
  // Folding by hand is immediate; unfolding by hand starts the wait again.
  const fold = (value: boolean) => {
    setFolded(value);
    if (!value) setShown((n) => n + 1);
  };
  return [folded, fold] as const;
}
