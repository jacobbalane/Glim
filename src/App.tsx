import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { listen } from '@tauri-apps/api/event';
import { ArrowUpRight, X } from 'lucide-react';
import { api, demo, native, designScene, designMotion } from './api';
import { DEFAULT_PREFERENCES, type Snapshot } from './types';
import { Details, SettingsSheet, SetupSheet, UsageSheet } from './panels';
import { Compact, Glance } from './island-views';
import IslandSurface from './IslandSurface';
import BrandPreview from './BrandPreview';
import { CharacterEnvironment } from './Character';
import { groupSessions, isNotice } from './session-presentation';
import useSessionPreview from './useSessionPreview';
import useReducedMotion from './useReducedMotion';
import './preview-embed.css';

type Panel = 'settings' | 'history' | 'setup';
type View = 'compact' | 'glance' | 'details' | Panel;

export default function App() {
  const requested = designScene?.panel ?? new URLSearchParams(location.search).get('view');
  const [view, setView] = useState<View>(() =>
    ['settings', 'history', 'setup'].includes(requested ?? '')
      ? (requested as Panel)
      : designScene?.detailsOpen
        ? 'details'
        : designScene?.expanded
          ? 'glance'
          : 'compact',
  );
  const [focusId, setFocusId] = useState<string | null>(
    designScene ? (designScene.selectedId ?? 'demo-claude') : null,
  );
  const [seenAt, setSeenAt] = useState(Date.now);
  const [inboxHidden, setInboxHidden] = useState(false);
  const [snapshot, setSnapshot] = useState<Snapshot>({
    sessions: [],
    preferences: DEFAULT_PREFERENCES,
    connectors: [],
  });
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now);
  const [held, setHeld] = useState(false);
  const [focused, setFocused] = useState(false);
  const [run, setRun] = useState(0);
  const boundary = useRef<HTMLDivElement>(null);
  const onboardingShown = useRef(false);
  const returnFocus = useRef(false);
  const reduced = useReducedMotion() || (!!designScene && !designMotion);
  const expanded = view !== 'compact';
  const paused = snapshot.preferences.paused;
  const groups = useMemo(
    () => groupSessions(snapshot.sessions, seenAt),
    [snapshot.sessions, seenAt],
  );
  const focus = groups.find((g) => g.session.id === focusId) ?? groups[0];
  const notch = useSessionPreview(groups, seenAt, {
    enabled: !expanded && !paused && (!designScene || designMotion),
    held: held || focused,
    ready: loaded,
    dwell: Math.max(6000, 2600 + (run / 40) * 1000),
  });
  const hidden =
    !expanded &&
    snapshot.preferences.idleBehavior === 'hidden' &&
    !groups.some((g) => g.session.activity === 'working' || isNotice(g, seenAt, now));
  const collapse = useCallback(() => {
    setView('compact');
    setFocusId(null);
    setSeenAt(Date.now());
  }, []);
  const back = useCallback(() => setView('glance'), []);
  const openPanel = useCallback((panel: Panel) => setView(panel), []);

  useEffect(() => {
    if (designScene) {
      document.documentElement.dataset.previewScene = designScene.id;
      document.documentElement.dataset.previewMotion = String(designMotion);
    }
    let disposed = false;
    let unsubscribe: (() => void) | undefined;
    const update = (value: Snapshot) => {
      if (!disposed) {
        setSnapshot(value);
        setLoaded(true);
      }
    };
    api
      .subscribe(update)
      .then((fn) => {
        if (disposed) fn();
        else unsubscribe = fn;
      })
      .then(() => api.snapshot())
      .then(update)
      .catch((e) => {
        if (!disposed) setError(String(e));
      });
    const clock =
      designScene && !designMotion ? undefined : setInterval(() => setNow(Date.now()), 1000);
    return () => {
      disposed = true;
      unsubscribe?.();
      clearInterval(clock);
    };
  }, []);
  useEffect(() => {
    if (!designScene || !loaded) return;
    const frame = requestAnimationFrame(() => {
      if (designScene?.confirmClear) {
        const scroll = boundary.current?.querySelector<HTMLElement>('.sheet-body.scroll');
        if (scroll) scroll.scrollTop = scroll.scrollHeight;
      }
      document.documentElement.dataset.previewReady = 'true';
    });
    return () => cancelAnimationFrame(frame);
  }, [loaded]);
  useEffect(() => {
    if (loaded && native && !snapshot.preferences.onboardingComplete && !onboardingShown.current) {
      onboardingShown.current = true;
      openPanel('setup');
    }
  }, [loaded, snapshot.preferences.onboardingComplete, openPanel]);
  useEffect(() => {
    if (view !== 'compact' || !returnFocus.current) return;
    returnFocus.current = false;
    const frame = requestAnimationFrame(() =>
      boundary.current?.querySelector<HTMLButtonElement>('.compact')?.focus(),
    );
    return () => cancelAnimationFrame(frame);
  }, [view]);
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
        !boundary.current?.querySelector('.island-shell')?.contains(target) &&
        !target.closest('.preview-bottom')
      )
        collapse();
    };
    const blur = () => {
      if (!designScene) collapse();
    };
    document.addEventListener('keydown', key);
    document.addEventListener('pointerdown', outside);
    window.addEventListener('blur', blur);
    return () => {
      document.removeEventListener('keydown', key);
      document.removeEventListener('pointerdown', outside);
      window.removeEventListener('blur', blur);
    };
  }, [expanded, view, collapse, back]);
  useEffect(() => {
    if (!native) return;
    let disposed = false;
    const cleanups: (() => void)[] = [];
    const register = async () => {
      const expand = await listen('glim:expand', back);
      if (disposed) expand();
      else cleanups.push(expand);
      const navigate = await listen<Panel>('glim:view', (event) => openPanel(event.payload));
      if (disposed) navigate();
      else cleanups.push(navigate);
    };
    void register().catch((e) => setError(String(e)));
    return () => {
      disposed = true;
      cleanups.forEach((fn) => fn());
    };
  }, [openPanel, back]);
  useEffect(() => {
    if (!designScene) return;
    const control = (event: MessageEvent) => {
      if (
        event.origin !== location.origin ||
        event.source !== window.parent ||
        event.data?.type !== 'glim:preview'
      )
        return;
      if (
        [
          'working',
          'waiting',
          'finished',
          'idle',
          'interrupted',
          'error',
          'stale',
          'reset',
        ].includes(event.data.status)
      )
        api.simulate(
          event.data.status,
          typeof event.data.sessionId === 'string' ? event.data.sessionId : undefined,
          typeof event.data.detail === 'string' ? event.data.detail : undefined,
        );
      if (event.data.view === 'compact') collapse();
      else if (event.data.view === 'glance') back();
      else if (['settings', 'history', 'setup'].includes(event.data.view))
        openPanel(event.data.view);
    };
    window.addEventListener('message', control);
    window.parent.postMessage({ type: 'glim:preview:ready' }, location.origin);
    return () => window.removeEventListener('message', control);
  }, [collapse, back, openPanel]);
  if (designScene?.brand) return <BrandPreview variant={designScene.brand} />;

  const sheetProps = {
    prefs: snapshot.preferences,
    onPrefs: api.savePreferences,
    connectors: snapshot.connectors,
    onConnectors: (connectors: Snapshot['connectors']) =>
      setSnapshot((s) => ({ ...s, connectors })),
    initialOpen: designScene?.connector,
  };
  let content: ReactNode;
  if (view === 'compact')
    content = (
      <Compact
        view={notch}
        inboxHidden={inboxHidden}
        onInboxHiddenChange={setInboxHidden}
        count={groups.length}
        paused={paused}
        now={now}
        onRun={setRun}
        onOpen={(id) => {
          setFocusId(id ?? null);
          back();
        }}
      />
    );
  else if (view === 'details' && focus)
    content = <Details group={focus} now={now} onBack={back} scroll />;
  else if (view === 'settings')
    content = (
      <SettingsSheet
        {...sheetProps}
        initialConfirmClear={designScene?.confirmClear}
        onBack={back}
        onUsage={() => openPanel('history')}
        scroll
      />
    );
  else if (view === 'history') content = <UsageSheet onBack={back} scroll />;
  else if (view === 'setup')
    content = <SetupSheet {...sheetProps} initialStep={designScene?.step} onDone={back} />;
  else
    content = (
      <Glance
        groups={groups}
        focusId={focus?.session.id}
        now={now}
        paused={paused}
        onFocus={setFocusId}
        onDetails={(id) => {
          setFocusId(id);
          setView('details');
        }}
        onShow={(id) =>
          api
            .showAgent(id)
            .then((shown) => shown && collapse())
            .catch((e) => setError(String(e)))
        }
        onUsage={() => openPanel('history')}
        onSettings={() => openPanel('settings')}
        onCollapse={collapse}
        onResume={() =>
          api
            .savePreferences({ ...snapshot.preferences, paused: false })
            .catch((e) => setError(String(e)))
        }
      />
    );
  return (
    <main className={native || designScene ? 'native-stage' : 'preview-stage'}>
      <div
        className={`island-anchor${hidden ? ' idle-hidden' : ''}`}
        ref={boundary}
        onPointerMove={(e) => setHeld(!!(e.target as Element).closest('.island-shell'))}
        onPointerLeave={() => setHeld(false)}
        onFocusCapture={() => setFocused(true)}
        onBlurCapture={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node)) setFocused(false);
        }}
      >
        <IslandSurface
          expanded={expanded}
          viewKey={view === 'details' ? `details-${focus?.session.id}` : view}
          tone={paused || !notch.current ? 'calm' : notch.current.look.tone}
          reduced={reduced}
          onError={setError}
        >
          <CharacterEnvironment.Provider value={{ animate: !reduced, active: !hidden }}>
            {content}
          </CharacterEnvironment.Provider>
        </IslandSurface>
      </div>
      {error && (
        <div className="error-toast" role="alert">
          {error}
          <button aria-label="Dismiss error" onClick={() => setError(null)}>
            <X size={14} />
          </button>
        </div>
      )}
      {!native && !designScene && (
        <div className="preview-bottom">
          <div className="preview-controls">
            <span className="preview-badge">
              {demo ? 'Preview · sample data' : 'Preview · no agents'}
            </span>
            {demo && (
              <div className="simulation-controls">
                <button onClick={() => api.simulate('working')}>Working</button>
                <button onClick={() => api.simulate('waiting')}>Approval</button>
                <button onClick={() => api.simulate('finished')}>Finished</button>
                <button onClick={() => api.simulate('reset')}>Reset</button>
              </div>
            )}
            <div className="preview-navigation">
              {import.meta.env.DEV && (
                <a href="/preview">
                  All views <ArrowUpRight size={13} />
                </a>
              )}
              <button onClick={() => openPanel('setup')}>
                Set up <ArrowUpRight size={13} />
              </button>
              <button onClick={() => openPanel('settings')}>
                Settings <ArrowUpRight size={13} />
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
