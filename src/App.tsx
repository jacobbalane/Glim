import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import { AnimatePresence, motion } from 'motion/react';
import useReducedMotion from './useReducedMotion';
import { listen } from '@tauri-apps/api/event';
import {
  ArrowLeft,
  ArrowUpRight,
  Check,
  ChevronDown,
  ChevronRight,
  Settings,
  X,
} from 'lucide-react';
import { api, demo, native, designScene, designMotion } from './api';
import { AgentMark, GlimMark } from './components';
import { compactNumber, elapsed, isActive, rankSessions, totalTokens } from './format';
import { DEFAULT_PREFERENCES, PROVIDERS, type Session, type Snapshot } from './types';
import { SettingsPanel, HistoryPanel } from './panels';
import IslandSurface, { IslandInk, SURFACE_SPRING } from './IslandSurface';
import Mascot from './Mascot';
import BrandPreview from './BrandPreview';
import WorkingIndicator from './WorkingIndicator';
import ChangingText, { StatusDot, WorkingDots } from './LiveText';
import useSessionPreview from './useSessionPreview';
import { attentionSummary, previewText, statusLabel, statusTone } from './session-presentation';
import './preview-embed.css';
import './island.css';

type Panel = 'settings' | 'history' | 'setup';

export default function App() {
  const requested = designScene?.panel ?? new URLSearchParams(location.search).get('view');
  const initialPanel = ['settings', 'history', 'setup'].includes(requested ?? '')
    ? (requested as Panel)
    : null;
  const [snapshot, setSnapshot] = useState<Snapshot>({
    sessions: [],
    preferences: DEFAULT_PREFERENCES,
    connectors: [],
  });
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(!!initialPanel || (designScene?.expanded ?? false));
  const [sessionList, setSessionList] = useState(designScene?.sessionList ?? false);
  const [detailsOpen, setDetailsOpen] = useState(designScene?.detailsOpen ?? false);
  const [panel, setPanel] = useState<Panel | null>(initialPanel);
  const [selectedId, setSelectedId] = useState<string | null>(
    designScene?.selectedId ?? (demo ? 'demo-claude' : null),
  );
  const [now, setNow] = useState(Date.now());
  const boundary = useRef<HTMLDivElement>(null);
  const onboardingShown = useRef(false);
  const reduced = useReducedMotion() || (!!designScene && !designMotion);
  const [held, setHeld] = useState(false);
  const [focused, setFocused] = useState(false);
  const [compactWidth, setCompactWidth] = useState(220);
  const [dwell, setDwell] = useState(6000);
  const measure = useRef<HTMLDivElement>(null);
  const sessions = rankSessions(snapshot.sessions);
  const preview = useSessionPreview(sessions, {
    enabled: !expanded && !snapshot.preferences.paused && (!designScene || designMotion),
    held: held || focused,
    initialId: designScene?.selectedId ?? (demo ? 'demo-claude' : null),
    dwell,
  });
  const selected = expanded
    ? (sessions.find((session) => session.id === selectedId) ?? preview)
    : preview;
  const activeCount = sessions.filter(isActive).length;
  const paused = snapshot.preferences.paused;
  const attention = paused || sessions.length < 2 ? [] : attentionSummary(sessions, now);
  const banner = attention.map((item) => item.text).join(' · ');
  const compactText = previewText(preview, paused, sessions.length > 1);
  const compactWorking = !!preview && preview.activity === 'working' && !paused;
  const hidden =
    snapshot.preferences.idleBehavior === 'hidden' && activeCount === 0 && !banner && !expanded;
  const view = !expanded
    ? 'compact'
    : (panel ?? (sessionList ? 'sessions' : detailsOpen && selected ? 'details' : 'glance'));

  useLayoutEffect(() => {
    const node = measure.current;
    if (!node) return;
    const resize = () => {
      const trigger = node.querySelector<HTMLElement>('.compact-trigger')!;
      const summary = node.querySelector<HTMLElement>('.attention-banner');
      const maximum = Math.min(360, window.innerWidth - 40);
      const natural = trigger.scrollWidth;
      const next = Math.ceil(
        Math.max(144, Math.min(maximum, Math.max(natural, summary?.scrollWidth ?? 0))),
      );
      setCompactWidth(next);
      setDwell(Math.max(6000, 4000 + (Math.max(0, natural - next) / 28) * 1000));
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(node);
    window.addEventListener('resize', resize);
    void document.fonts.ready.then(() => {
      if (node.isConnected) resize();
    });
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', resize);
    };
  }, [compactText, compactWorking, sessions.length, banner]);

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
      .catch((e) => setError(String(e)));
    const clock = designScene ? undefined : setInterval(() => setNow(Date.now()), 1000);
    return () => {
      disposed = true;
      unsubscribe?.();
      clearInterval(clock);
    };
  }, []);
  useEffect(() => {
    const scene = designScene;
    if (!scene || !loaded) return;
    const ready = requestAnimationFrame(() => {
      if (scene.confirmClear) {
        const scroller = boundary.current?.querySelector<HTMLElement>('.notch-scroll');
        if (scroller) scroller.scrollTop = scroller.scrollHeight;
      }
      document.documentElement.dataset.previewReady = 'true';
    });
    return () => cancelAnimationFrame(ready);
  }, [loaded]);
  const openPanel = useCallback((next: Panel) => {
    setPanel(next);
    setExpanded(true);
    setSessionList(false);
    setDetailsOpen(false);
  }, []);
  const closePanel = useCallback(() => {
    setPanel(null);
    setSessionList(false);
    setDetailsOpen(false);
  }, []);
  const collapse = useCallback(() => {
    closePanel();
    setExpanded(false);
  }, [closePanel]);
  const expandPreview = () => {
    setSelectedId(preview?.id ?? null);
    setExpanded(true);
  };
  useEffect(() => {
    if (loaded && native && !snapshot.preferences.onboardingComplete && !onboardingShown.current) {
      onboardingShown.current = true;
      openPanel('setup');
    }
  }, [loaded, snapshot.preferences.onboardingComplete, openPanel]);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (panel || sessionList || detailsOpen) closePanel();
      else {
        collapse();
        requestAnimationFrame(() =>
          boundary.current?.querySelector<HTMLButtonElement>('.compact-trigger')?.focus(),
        );
      }
    };
    const outside = (event: PointerEvent) => {
      if (
        !boundary.current?.querySelector('.island-shell')?.contains(event.target as Node) &&
        !(event.target as Element).closest('.preview-bottom')
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
  }, [panel, sessionList, detailsOpen, closePanel, collapse]);
  useEffect(() => {
    if (!native) return;
    let disposed = false;
    const cleanups: (() => void)[] = [];
    const register = async () => {
      const expand = await listen('glim:expand', () => {
        closePanel();
        setExpanded(true);
      });
      const navigate = await listen<Panel>('glim:view', (event) => openPanel(event.payload));
      if (disposed) {
        expand();
        navigate();
      } else cleanups.push(expand, navigate);
    };
    void register().catch((e) => setError(String(e)));
    return () => {
      disposed = true;
      cleanups.forEach((fn) => fn());
    };
  }, [openPanel, closePanel]);
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
      else if (event.data.view === 'glance') {
        closePanel();
        setExpanded(true);
      } else if (['settings', 'history', 'setup'].includes(event.data.view))
        openPanel(event.data.view);
    };
    window.addEventListener('message', control);
    return () => window.removeEventListener('message', control);
  }, [collapse, closePanel, openPanel]);
  if (designScene?.brand) return <BrandPreview variant={designScene.brand} />;

  const heading =
    view === 'settings'
      ? 'Settings'
      : view === 'history'
        ? 'History'
        : view === 'setup'
          ? 'Setup'
          : view === 'sessions'
            ? 'Sessions'
            : 'Usage';
  return (
    <main className={native || designScene ? 'native-stage' : 'preview-stage'}>
      <div className="compact-measure" ref={measure} aria-hidden="true" inert>
        <div className="compact-trigger">
          <span className="compact-measure-mark" />
          <span className="compact-label">
            {compactText}
            {compactWorking && <WorkingDots reduced />}
          </span>
          {sessions.length > 1 && <span className="compact-count">{sessions.length}</span>}
          <ChevronDown size={13} />
        </div>
        {banner && <div className="attention-banner">{banner}</div>}
      </div>
      <div
        className={`island-anchor ${hidden ? 'idle-hidden' : ''}`}
        ref={boundary}
        onPointerMove={(event) => setHeld(!!(event.target as Element).closest('.island-shell'))}
        onPointerLeave={() => setHeld(false)}
        onFocusCapture={() => setFocused(true)}
        onBlurCapture={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node)) setFocused(false);
        }}
        style={
          {
            '--agent-accent': selected ? PROVIDERS[selected.provider].color : '#b09afa',
          } as CSSProperties
        }
      >
        <IslandSurface
          expanded={expanded}
          compactWidth={compactWidth}
          reduced={reduced}
          onError={setError}
        >
          <AnimatePresence initial={false} mode="popLayout">
            <motion.div
              key={view}
              className="island-view"
              style={{ width: '100%', marginInline: 'auto' }}
              initial={{ opacity: 0, y: reduced ? 0 : 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: reduced ? 0 : 4 }}
              transition={{ ...SURFACE_SPRING, opacity: { duration: reduced ? 0.08 : 0.14 } }}
            >
              <IslandInk compact={view === 'compact'}>
                {view === 'compact' ? (
                  <>
                    <button
                      className="compact-trigger"
                      aria-label="Expand Glim"
                      aria-expanded={false}
                      onClick={expandPreview}
                      data-session-id={preview?.id}
                      title={
                        preview
                          ? `${PROVIDERS[preview.provider].name} · ${preview.project} · ${compactText}`
                          : compactText
                      }
                    >
                      {selected ? (
                        <span
                          className={`compact-mark ${selected.provider}`}
                          style={{ color: PROVIDERS[selected.provider].color }}
                        >
                          <AgentMark provider={selected.provider} size={19} />
                        </span>
                      ) : (
                        <GlimMark size={18} />
                      )}
                      <span className="compact-label">
                        <ChangingText
                          value={compactText}
                          identity={`${preview?.id}:${compactText}`}
                          marquee
                          working={compactWorking}
                          reduced={reduced}
                        />
                      </span>
                      {sessions.length > 1 && (
                        <span className="compact-count">{sessions.length}</span>
                      )}
                      <ChevronDown size={13} className="muted" />
                    </button>
                    {banner && (
                      <button
                        className="attention-banner"
                        aria-label={`View sessions: ${banner}`}
                        onClick={() => {
                          expandPreview();
                          setSessionList(true);
                        }}
                      >
                        <ChangingText value={banner} reduced={reduced} marquee />
                      </button>
                    )}
                  </>
                ) : (
                  <>
                    <header className="notch-toolbar">
                      <button
                        className="notch-header-toggle"
                        aria-label="Collapse Glim"
                        title="Collapse"
                        onClick={collapse}
                      >
                        <ChevronDown size={14} className="collapse-chevron" />
                      </button>
                      {view === 'glance' ? (
                        selected ? (
                          <div className="notch-agent">
                            <AgentMark provider={selected.provider} size={18} />
                            <h2>
                              <ChangingText
                                value={PROVIDERS[selected.provider].name}
                                reduced={reduced}
                              />
                            </h2>
                            {sessions.length > 0 && (
                              <button
                                className="session-count"
                                aria-label="Choose session"
                                title="Sessions"
                                onClick={() => setSessionList(true)}
                              >
                                {sessions.length}
                                <ChevronDown size={10} />
                              </button>
                            )}
                          </div>
                        ) : (
                          <GlimMark size={20} />
                        )
                      ) : (
                        <button
                          className="notch-back"
                          aria-label={panel ? 'Close panel' : 'Back to agent'}
                          onClick={closePanel}
                        >
                          <ArrowLeft size={14} />
                          <span>{heading}</span>
                        </button>
                      )}
                      <div className="notch-actions">
                        {view === 'glance' && (
                          <button
                            className="icon-button"
                            aria-label="Open settings"
                            title="Settings"
                            onClick={() => openPanel('settings')}
                          >
                            <Settings size={14} />
                          </button>
                        )}
                      </div>
                    </header>
                    {view === 'glance' &&
                      (selected ? (
                        <Glance
                          session={selected}
                          paused={paused}
                          now={now}
                          reduced={reduced}
                          onDetails={() => setDetailsOpen(true)}
                        />
                      ) : (
                        <div className="notch-empty">
                          <Mascot small still={reduced} />
                          <div>
                            <h1>No active agents</h1>
                            <button className="text-button" onClick={() => openPanel('setup')}>
                              {loaded ? 'Connect an agent' : 'Connecting…'}{' '}
                              <ArrowUpRight size={12} />
                            </button>
                          </div>
                        </div>
                      ))}
                    {view === 'sessions' && (
                      <div className="notch-scroll session-picker" aria-label="Agent sessions">
                        {sessions.map((session) => (
                          <button
                            className={`session-choice ${selected?.id === session.id ? 'selected' : ''}`}
                            key={session.id}
                            style={
                              {
                                '--agent-accent': PROVIDERS[session.provider].color,
                              } as CSSProperties
                            }
                            onClick={() => {
                              setSelectedId(session.id);
                              setSessionList(false);
                            }}
                          >
                            <span style={{ color: PROVIDERS[session.provider].color }}>
                              <AgentMark provider={session.provider} size={19} />
                            </span>
                            <span className="session-choice-label">
                              <strong>{session.project}</strong>
                              <small>{PROVIDERS[session.provider].name}</small>
                            </span>
                            <span className="session-choice-state">
                              <StatusDot tone={statusTone(session, paused)} />
                              {statusLabel(session, paused)}
                            </span>
                            {selected?.id === session.id ? (
                              <Check size={12} />
                            ) : (
                              <ChevronRight size={12} />
                            )}
                          </button>
                        ))}
                      </div>
                    )}
                    {view === 'details' && selected && (
                      <div className="notch-scroll">
                        <SessionDetails session={selected} now={now} reduced={reduced} />
                      </div>
                    )}
                    {(view === 'settings' || view === 'setup' || view === 'history') && (
                      <div className="notch-scroll notch-panel">
                        {view === 'history' ? (
                          <HistoryPanel onBack={() => openPanel('settings')} />
                        ) : (
                          <SettingsPanel
                            snapshot={snapshot}
                            onboarding={view === 'setup'}
                            initialStep={designScene?.step}
                            initialConnector={designScene?.connector}
                            initialConfirmClear={designScene?.confirmClear}
                            stillMascot={reduced}
                            onHistory={() => openPanel('history')}
                            onDone={closePanel}
                          />
                        )}
                      </div>
                    )}
                  </>
                )}
              </IslandInk>
            </motion.div>
          </AnimatePresence>
        </IslandSurface>
      </div>
      {error && (
        <div role="alert" className="error-toast">
          {error}
          <button className="icon-button" aria-label="Dismiss error" onClick={() => setError(null)}>
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
                <a className="text-button" href="/preview">
                  All views <ArrowUpRight size={13} />
                </a>
              )}
              <button className="text-button" onClick={() => openPanel('setup')}>
                Set up <ArrowUpRight size={13} />
              </button>
              <button className="text-button" onClick={() => openPanel('settings')}>
                Settings <ArrowUpRight size={13} />
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

function Glance({
  session: s,
  paused,
  now,
  reduced,
  onDetails,
}: {
  session: Session;
  paused: boolean;
  now: number;
  reduced: boolean;
  onDetails: () => void;
}) {
  const task = s.tasks.find((item) => item.status === 'in_progress');
  const completed = s.tasks.filter((item) => item.status === 'completed').length;
  const limits = s.limits.filter((limit) => limit.resetsAt > now);
  const working = s.activity === 'working' && !paused;
  const detail = paused
    ? 'Monitoring paused'
    : working && task
      ? `${s.detail} · ${task.label}`
      : s.detail;
  return (
    <div className="notch-glance">
      <div className="notch-project-status">
        <h3 title={s.project}>
          <ChangingText value={s.project} reduced={reduced} />
        </h3>
        {s.tasks.length > 0 && (
          <span className="notch-step-count">
            {completed}/{s.tasks.length} steps
          </span>
        )}
      </div>
      <button
        className="notch-usage"
        aria-label="Details"
        title="Token breakdown"
        onClick={onDetails}
      >
        <span>
          <ChangingText
            value={
              totalTokens(s.tokens) === null
                ? 'Tokens —'
                : `${compactNumber(totalTokens(s.tokens))} tokens`
            }
            reduced={reduced}
          />
        </span>
        <span>
          <ChangingText
            value={
              s.contextPercent === null ? 'Context —' : `${Math.round(s.contextPercent)}% context`
            }
            reduced={reduced}
          />
        </span>
      </button>
      <div
        className="context-track"
        role="progressbar"
        aria-label="Context used"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={s.contextPercent ?? undefined}
      >
        <motion.span
          initial={false}
          animate={{ scaleX: (s.contextPercent ?? 0) / 100 }}
          transition={reduced ? { duration: 0 } : SURFACE_SPRING}
        />
      </div>
      {limits.length > 0 && (
        <div className="notch-allowance">
          {limits.map((limit) => (
            <span key={limit.label}>
              {limit.label} · {Math.round(limit.usedPercent)}% used{' '}
              <span>Resets in {elapsed(now, limit.resetsAt)}</span>
            </span>
          ))}
        </div>
      )}
      <div className="notch-live-status" aria-live="polite">
        <div className="notch-live-copy">
          <h2 className="notch-status">
            <StatusDot tone={statusTone(s, paused)} />
            <ChangingText value={statusLabel(s, paused)} reduced={reduced} working={working} />
          </h2>
          <div className="notch-task">
            <ChangingText value={detail} reduced={reduced} marquee />
          </div>
        </div>
        {working && <WorkingIndicator color={PROVIDERS[s.provider].color} reduced={reduced} />}
      </div>
    </div>
  );
}
function SessionDetails({
  session: s,
  now,
  reduced,
}: {
  session: Session;
  now: number;
  reduced: boolean;
}) {
  const fields: [string, number | null][] = [
    ['Input', s.tokens?.input ?? null],
    ['Output', s.tokens?.output ?? null],
    ['Cached reads', s.tokens?.cached ?? null],
  ];
  if (s.tokens?.cacheWrite) fields.push(['Cache writes', s.tokens.cacheWrite]);
  if (s.tokens?.reasoning) fields.push(['Reasoning', s.tokens.reasoning]);
  const limits = s.limits.filter((limit) => limit.resetsAt > now);
  return (
    <section className="notch-details" aria-label="Session usage details">
      <div className="notch-detail-metrics">
        {fields.map(([label, value]) => (
          <div key={label}>
            <span>{label}</span>
            <strong>
              <ChangingText value={compactNumber(value)} reduced={reduced} />
            </strong>
          </div>
        ))}
      </div>
      {limits.length ? (
        <div className="notch-limits">
          {limits.map((limit) => (
            <div key={limit.label}>
              <div>
                <span>{limit.label} allowance</span>
                <span>{Math.round(limit.usedPercent)}% used</span>
              </div>
              <div className="limit-track">
                <motion.i
                  initial={false}
                  animate={{ scaleX: limit.usedPercent / 100 }}
                  transition={reduced ? { duration: 0 } : SURFACE_SPRING}
                />
              </div>
              <small>Resets in {elapsed(now, limit.resetsAt)}</small>
            </div>
          ))}
        </div>
      ) : (
        <p className="detail-note">Account allowance unavailable.</p>
      )}
      {s.tasks.length > 0 && (
        <div className="notch-tasks">
          {s.tasks.map((task) => (
            <div key={task.id}>
              <span className={`task-indicator ${task.status}`}>
                {task.status === 'completed' ? <Check size={9} /> : null}
              </span>
              <span>{task.label}</span>
            </div>
          ))}
        </div>
      )}
      <p className="detail-note">
        {s.model}
        {s.provider === 'codex' && s.contextPercent !== null ? ' · Context estimated' : ''}
      </p>
      {s.measurementNote && <p className="detail-note">{s.measurementNote}</p>}
    </section>
  );
}
