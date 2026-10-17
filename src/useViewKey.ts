import { useRef } from 'react';

// Each visit to a sheet (Details, Settings, Usage, Setup) is a fresh view. AnimatePresence revives
// a view that is still fading out when its key comes back, with whatever it had loaded: Usage would
// show history read before it was cleared. The island's own views carry no loaded state, so going
// back to them may revive them.
export default function useViewKey(view: string, focusId?: string): string {
  const visit = useRef({ view, count: 0 });
  if (visit.current.view !== view) visit.current = { view, count: visit.current.count + 1 };
  if (view === 'compact' || view === 'glance') return view;
  return `${view}-${view === 'details' ? `${focusId}-` : ''}${visit.current.count}`;
}
