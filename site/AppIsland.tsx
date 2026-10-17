// The desktop app's own island, driven by the website. Every piece below is imported from the
// app (src/) unchanged, so the notch here is the notch in the app; this file only replaces the
// app's data and window plumbing (src/App.tsx) with the website's sample sessions and scenes.
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import IslandSurface from '../src/IslandSurface';
import useViewKey from '../src/useViewKey';
import { Compact, Glance } from '../src/island-views';
import { Details, SettingsSheet, SetupSheet, UsageSheet } from '../src/panels';
import { groupSessions } from '../src/session-presentation';
import useSessionPreview from '../src/useSessionPreview';
import useNoticeFold from '../src/useNoticeFold';
import useReducedMotion from '../src/useReducedMotion';
import { quickAction, selectedQuickOptions } from '../src/quick-options';
import type { Connector, Preferences, Session } from '../src/types';
import type { Notch } from '../src/api';

export type IslandView = 'compact' | 'glance' | 'details' | 'settings' | 'usage' | 'setup';

export function AppIsland({
  sessions,
  seenAt,
  onSeen,
  view,
  onView,
  prefs,
  onPrefs,
  connectors,
  onConnectors,
  fast = false,
  notch = null,
}: {
  sessions: Session[];
  seenAt: number;
  onSeen: (time: number) => void;
  view: IslandView;
  onView: (view: IslandView) => void;
  prefs: Preferences;
  onPrefs: (next: Preferences) => void;
  connectors: Connector[];
  onConnectors: (next: Connector[]) => void;
  // Several agents on show: the notch moves through them and their notices quickly.
  fast?: boolean;
  // A Mac's camera notch to wrap, as the app does on a MacBook.
  notch?: Notch | null;
}) {
  const reduced = useReducedMotion();
  const anchor = useRef<HTMLDivElement>(null);
  const returnFocus = useRef(false);
  const [now, setNow] = useState(Date.now);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [listed, setListed] = useState(false);
  const [held, setHeld] = useState(false);
  // Where along the top the visitor has moved the island; the page forgets it on reload.
  const [position, setPosition] = useState(0.5);
  const [run, setRun] = useState(0);
  const expanded = view !== 'compact';
  const viewKey = useViewKey(view, focusId ?? undefined);
  const groups = groupSessions(sessions, seenAt);
  const focus = groups.find((g) => g.session.id === focusId) ?? groups[0];
  // The same rotation and notices as the app, with the same timings.
  const preview = useSessionPreview(groups, seenAt, {
    enabled: !expanded && !prefs.paused,
    held,
    ready: true,
    dwell: fast ? 1800 : Math.max(6000, 2600 + (run / 40) * 1000),
    pace: fast ? 0.35 : 1,
  });
  const [folded, setFolded] = useNoticeFold(preview, held || expanded);
  const save = async (next: Preferences) => onPrefs(next);

  const collapse = useCallback(() => {
    onView('compact');
    onSeen(Date.now());
    setFocusId(null);
  }, [onView, onSeen]);
  const back = useCallback(() => onView('glance'), [onView]);

  useEffect(() => {
    const clock = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(clock);
  }, []);
  useEffect(() => {
    if (view !== 'compact' || !returnFocus.current) return;
    returnFocus.current = false;
    const frame = requestAnimationFrame(() =>
      anchor.current?.querySelector<HTMLButtonElement>('.compact')?.focus(),
    );
    return () => cancelAnimationFrame(frame);
  }, [view]);
  // Escape steps back, and a click outside closes it, as in the app. Parts of the page that steer
  // the island ([data-keep-open]) do not count as outside.
  useEffect(() => {
    if (!expanded) return;
    const key = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (view === 'glance') {
        returnFocus.current = true;
        collapse();
      } else back();
    };
    const outside = (event: PointerEvent) => {
      const target = event.target as Element;
      if (
        anchor.current?.querySelector('.island-shell')?.contains(target) ||
        target.closest?.('[data-keep-open]')
      )
        return;
      collapse();
    };
    document.addEventListener('keydown', key);
    document.addEventListener('pointerdown', outside);
    return () => {
      document.removeEventListener('keydown', key);
      document.removeEventListener('pointerdown', outside);
    };
  }, [expanded, view, collapse, back]);

  const sheet = { prefs, onPrefs: save, connectors, onConnectors };
  let content: ReactNode;
  if (view === 'compact')
    content = (
      <Compact
        view={preview}
        notch={notch}
        folded={folded}
        onFoldedChange={setFolded}
        count={groups.length}
        paused={prefs.paused}
        now={now}
        onRun={setRun}
        onOpen={(id, picked) => {
          setFocusId(id ?? null);
          if (picked) setListed(false);
          back();
        }}
      />
    );
  else if (view === 'details' && focus)
    content = <Details group={focus} now={now} onBack={back} scroll />;
  else if (view === 'settings')
    content = <SettingsSheet {...sheet} onBack={back} onUsage={() => onView('usage')} scroll />;
  else if (view === 'usage') content = <UsageSheet onBack={back} scroll />;
  else if (view === 'setup') content = <SetupSheet {...sheet} onDone={back} />;
  else
    content = (
      <Glance
        groups={groups}
        focusId={focus?.session.id}
        listed={listed}
        now={now}
        paused={prefs.paused}
        onList={setListed}
        onFocus={(id) => {
          setFocusId(id);
          setListed(false);
        }}
        onShow={collapse}
        onDetails={(id) => {
          setFocusId(id);
          onView('details');
        }}
        onUsage={() => onView('usage')}
        onSettings={() => onView('settings')}
        onCollapse={collapse}
        onResume={() => onPrefs({ ...prefs, paused: false })}
      />
    );
  return (
    <div
      className="island-anchor"
      ref={anchor}
      onPointerMove={(e) => setHeld(!!(e.target as Element).closest('.island-shell'))}
      onPointerLeave={() => setHeld(false)}
    >
      <IslandSurface
        expanded={expanded}
        notch={notch}
        viewKey={viewKey}
        tone={prefs.paused || !preview.current ? 'calm' : preview.current.look.tone}
        glow={prefs.glow ?? 50}
        reduced={reduced}
        onError={() => {}}
        // Around a notch the island stays on it, as in the app.
        position={notch ? 0.5 : position}
        onPosition={notch ? undefined : async (next) => setPosition(next)}
        // The app's quick options, acting on this page; Quit has nothing to quit here.
        options={
          prefs.quickOptionsEnabled
            ? selectedQuickOptions(prefs).map((id) =>
                quickAction(
                  id,
                  {
                    centre: async () => setPosition(0.5),
                    pause: async () => onPrefs({ ...prefs, paused: !prefs.paused }),
                    settings: async () => onView('settings'),
                    usage: async () => onView('usage'),
                    setup: async () => onView('setup'),
                    quit: undefined,
                  }[id],
                  prefs.paused,
                ),
              )
            : undefined
        }
      >
        {content}
      </IslandSurface>
    </div>
  );
}
