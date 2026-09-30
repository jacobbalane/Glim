import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, MotionConfig, motion, useReducedMotion } from 'motion/react';
import {
  ArrowUpRight,
  Bell,
  BellOff,
  Check,
  ChevronDown,
  ChevronUp,
  CircleHelp,
  GripHorizontal,
  Minus,
  Power,
  Radio,
  RotateCcw,
  Terminal,
  X,
} from 'lucide-react';
import {
  ACTIVITY,
  PROVIDER,
  attentionEvents,
  needsAttention,
  summarize,
  usageFreshness,
  type AccountUsage,
  type Session,
  type Snapshot,
} from '../../contracts/src';
import { demoSnapshot, emptySnapshot } from './demo';
import { dragIsland, native, quit, readSnapshot, resizeIsland, revealTerminal } from './native';

function GlimMark() {
  return (
    <span className="glim-mark" aria-hidden="true">
      <i />
      <i />
      <i />
    </span>
  );
}
function ProviderMark({ provider }: { provider: Session['provider'] }) {
  return (
    <span className={`provider-mark ${provider}`} aria-hidden="true">
      {provider === 'claude' ? '✳' : <Terminal size={15} strokeWidth={1.7} />}
    </span>
  );
}
function age(timestamp: number, now: number) {
  const minutes = Math.max(0, Math.floor((now - timestamp) / 60_000));
  return minutes < 1
    ? 'just now'
    : minutes < 60
      ? `${minutes}m ago`
      : `${Math.floor(minutes / 60)}h ago`;
}
function resetLabel(timestamp: number | undefined, now: number) {
  if (!timestamp) return 'Reset time unavailable';
  const minutes = Math.max(0, Math.ceil((timestamp - now) / 60_000));
  if (minutes === 0) return 'Awaiting refresh';
  if (minutes >= 1440) return `Resets in ${Math.ceil(minutes / 1440)}d`;
  return `Resets in ${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}
function AccountCard({ account, now }: { account: AccountUsage; now: number }) {
  const freshness = usageFreshness(account, now);
  return (
    <div className={`account-card ${account.provider}`}>
      <div className="account-heading">
        <ProviderMark provider={account.provider} />
        <span>{PROVIDER[account.provider]}</span>
        {freshness === 'stale' && <small>Outdated</small>}
      </div>
      {freshness === 'unavailable' ? (
        <p className="unavailable">
          Usage unavailable<span>{account.reason ?? 'Waiting for a provider reading.'}</span>
        </p>
      ) : (
        account.windows.map((window) => (
          <div className="quota" key={window.label}>
            <div className="quota-label">
              <span>{window.label}</span>
              <span>
                {Math.round(window.usedPercent)}
                <small>% used</small>
              </span>
            </div>
            <div
              className="quota-track"
              role="meter"
              aria-label={`${PROVIDER[account.provider]} ${window.label} usage${freshness === 'stale' ? ', outdated reading' : ''}`}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={window.usedPercent}
            >
              <span
                style={{
                  transform: `scaleX(${Math.max(0, Math.min(100, window.usedPercent)) / 100})`,
                }}
              />
            </div>
            <span className="reset-label">{resetLabel(window.resetsAt, now)}</span>
          </div>
        ))
      )}
    </div>
  );
}

export function App() {
  const preview = !native;
  const [snapshot, setSnapshot] = useState<Snapshot>(emptySnapshot);
  const previous = useRef<Snapshot | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [snoozed, setSnoozed] = useState(false);
  const [help, setHelp] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState<Session | null>(null);
  const [now, setNow] = useState(Date.now());
  const [immediate, setImmediate] = useState(false);
  const [busy, setBusy] = useState(false);
  const reduce = useReducedMotion();
  const interaction = useRef(false);
  const expandedRef = useRef(false);
  const snoozeRef = useRef(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const island = useRef<HTMLElement>(null);
  const summary = summarize(snapshot.sessions);
  const sessions = snapshot.sessions.filter((s) => s.activity !== 'closed');
  const visible = expanded || notice !== null;
  const selection = sessions.find((s) => s.id === selected);

  function toggle(next: boolean, keyboard = false) {
    setImmediate(keyboard);
    setExpanded(next);
    setNotice(null);
    setHelp(false);
    if (!next) {
      setSelected(null);
      trigger.current?.focus({ preventScroll: true });
    }
  }
  useEffect(() => {
    expandedRef.current = expanded;
  }, [expanded]);
  useEffect(() => {
    snoozeRef.current = snoozed;
  }, [snoozed]);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    if (preview) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const value = await readSnapshot();
        if (cancelled) return;
        const alerts = previous.current ? attentionEvents(previous.current, value) : [];
        previous.current = value;
        setSnapshot(value);
        setError('');
        if (!expandedRef.current && !snoozeRef.current && alerts.length) {
          setImmediate(false);
          setNotice(alerts[0]);
        }
      } catch {
        if (!cancelled) {
          previous.current = null;
          setNotice(null);
          setSnapshot((last) => ({
            ...last,
            bridgeWindows: 0,
            sessions: last.sessions.map((session) => ({
              ...session,
              health: 'disconnected',
              terminal: undefined,
            })),
          }));
          setError('Connection interrupted. Reconnecting…');
        }
      }
      if (!cancelled) timer = setTimeout(poll, 1000);
    };
    void poll();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [preview]);
  useEffect(() => {
    if (!native || !island.current) return;
    let active = true;
    let pending: { width: number; height: number } | null = null;
    let resizing = false;
    async function flush() {
      if (resizing || !pending || !active) return;
      resizing = true;
      const size = pending;
      pending = null;
      try {
        await resizeIsland(size.width, size.height);
      } catch {
        if (active) setError('The island could not resize.');
      } finally {
        resizing = false;
        if (pending && active) void flush();
      }
    }
    const observer = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      pending = { width: Math.ceil(width), height: Math.ceil(height) };
      void flush();
    });
    observer.observe(island.current);
    return () => {
      active = false;
      observer.disconnect();
    };
  }, []);
  useEffect(() => {
    if (!notice) return;
    const timer = setInterval(() => {
      if (!interaction.current) setNotice(null);
    }, 4000);
    return () => clearInterval(timer);
  }, [notice]);
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setMessage(''), 5000);
    return () => clearTimeout(timer);
  }, [message]);

  function demo(mode: 'sessions' | 'empty' | 'approval' | 'finished' | 'stale') {
    const next = mode === 'empty' ? structuredClone(emptySnapshot) : demoSnapshot();
    if (mode === 'stale') {
      next.sessions.forEach((s) => {
        s.health = 'stale';
        s.observedAt -= 600_000;
      });
      next.accounts.forEach((a) => {
        a.observedAt! -= 600_000;
      });
    }
    if (mode === 'approval' || mode === 'finished') {
      next.sessions[0].activity = mode === 'approval' ? 'approval' : 'responded';
      if (!snoozed) {
        setExpanded(false);
        setNotice(next.sessions[0]);
      }
    } else {
      setNotice(null);
    }
    setSnapshot(next);
    setSelected(null);
    setImmediate(false);
    setNow(Date.now());
  }
  async function returnToAgent(session: Session) {
    if (!session.terminal || preview) {
      setMessage(
        preview
          ? 'Demo session. Live terminals connect through the VS Code bridge.'
          : 'This session has no verified terminal yet.',
      );
      return;
    }
    setBusy(true);
    try {
      await revealTerminal(session.terminal);
      toggle(false, true);
    } catch {
      setMessage('Terminal unavailable. It may have closed or disconnected.');
    } finally {
      setBusy(false);
    }
  }
  const transition =
    immediate || reduce ? { duration: 0 } : { type: 'spring' as const, bounce: 0, duration: 0.4 };
  return (
    <MotionConfig reducedMotion="user">
      <main className={preview ? 'preview-stage' : 'native-stage'}>
        {preview && (
          <>
            <div className="preview-brand">
              <GlimMark />
              <span>Glim</span>
              <span className="preview-tag">INTERACTION PREVIEW</span>
            </div>
            <div className="ambient" aria-hidden="true" />
          </>
        )}
        <div className="island-anchor">
          <motion.section
            ref={island}
            layout
            transition={transition}
            className={`island ${visible ? 'is-expanded' : ''}`}
            aria-label="Glim agent monitor"
            onPointerEnter={() => {
              interaction.current = true;
            }}
            onPointerLeave={() => {
              interaction.current = false;
            }}
            onFocusCapture={() => {
              interaction.current = true;
            }}
            onBlurCapture={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget)) interaction.current = false;
            }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.preventDefault();
                toggle(false, true);
              }
            }}
          >
            <motion.div layout="position" transition={transition} className="island-header">
              <button
                ref={trigger}
                className="island-toggle"
                aria-expanded={visible}
                aria-controls="island-panel"
                onClick={(e) => toggle(!expanded, e.detail === 0)}
              >
                <GlimMark />
                <span className="compact-text">
                  {visible ? (
                    'Glim'
                  ) : summary.attention ? (
                    <>
                      {summary.attention} <span>need{summary.attention === 1 ? 's' : ''} you</span>
                    </>
                  ) : summary.working ? (
                    <>
                      {summary.working} <span>working</span>
                    </>
                  ) : summary.total ? (
                    <>
                      {summary.total} <span>session{summary.total === 1 ? '' : 's'}</span>
                    </>
                  ) : (
                    <span>Ready when you are</span>
                  )}
                </span>
                {!visible && (
                  <span
                    className={`compact-indicator ${summary.attention ? 'attention' : ''}`}
                    aria-hidden="true"
                  >
                    {summary.attention ? <Bell size={13} /> : <span className="status-dot" />}
                  </span>
                )}
                {!visible && <ChevronDown size={12} className="compact-chevron" />}
              </button>
              {visible && (
                <div className="header-actions">
                  <span className="session-count">{summary.total} sessions</span>
                  {native && (
                    <button
                      className="icon-button drag-handle"
                      aria-label="Drag island"
                      onPointerDown={(e) => {
                        if (e.button === 0)
                          void dragIsland().catch(() => setError('Unable to move the island.'));
                      }}
                    >
                      <GripHorizontal size={16} />
                    </button>
                  )}
                  <button
                    className="icon-button"
                    aria-label="Collapse island"
                    onClick={(e) => toggle(false, e.detail === 0)}
                  >
                    <Minus size={17} />
                  </button>
                </div>
              )}
            </motion.div>
            <AnimatePresence initial={false}>
              {visible && (
                <motion.div
                  layout="position"
                  id="island-panel"
                  className="island-panel"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{
                    layout: transition,
                    opacity: { duration: immediate || reduce ? 0 : 0.16 },
                  }}
                >
                  {notice && !expanded ? (
                    <button
                      className="attention-preview"
                      onClick={(e) => toggle(true, e.detail === 0)}
                    >
                      <span
                        className={`attention-icon ${notice.activity === 'responded' ? 'finished' : ''}`}
                      >
                        {notice.activity === 'responded' ? <Check size={21} /> : <Bell size={21} />}
                      </span>
                      <span>
                        <strong>{ACTIVITY[notice.activity]}</strong>
                        <small>
                          {notice.project} <span>· {PROVIDER[notice.provider]}</span>
                        </small>
                      </span>
                      <ChevronDown size={15} />
                    </button>
                  ) : (
                    <>
                      <div className="panel-status">
                        <span className={`status-dot ${summary.attention ? 'amber' : ''}`} />
                        {summary.attention
                          ? `${summary.attention} ${summary.attention === 1 ? 'session needs' : 'sessions need'} your attention`
                          : summary.working
                            ? 'A little progress, while you do your thing.'
                            : 'Your focus belongs to you.'}
                      </div>
                      {help ? (
                        <div className="setup-info">
                          <Radio size={28} />
                          <h2>One setup. Then just open Glim.</h2>
                          <p>
                            The desktop app reads local status hooks from Claude Code and Codex. Its
                            VS Code companion links each session to a terminal.
                          </p>
                          <p>
                            Keep using your usual commands. Your prompts, code, and tool output stay
                            out of Glim.
                          </p>
                          <p className="muted">
                            This development build has manual integration setup. Usage collection
                            and native overlay validation are still in progress.
                          </p>
                          <button className="subtle-button" onClick={() => setHelp(false)}>
                            Back to sessions
                          </button>
                        </div>
                      ) : (
                        <>
                          <div className="section-heading">
                            <h2>SESSIONS</h2>
                            <span>
                              {summary.working > 0 && `${summary.working} working`}
                              {summary.unverified > 0 &&
                                ` · ${summary.unverified} awaiting updates`}
                            </span>
                          </div>
                          <div className="session-list" aria-label="Agent sessions">
                            {sessions.length === 0 ? (
                              <div className="empty-state">
                                <span className="empty-orbit">
                                  <Terminal size={22} />
                                </span>
                                <h2>A little quiet. A lot of possibility.</h2>
                                <p>
                                  Once connected, your Claude Code and Codex sessions will appear
                                  here automatically.
                                </p>
                                <button className="subtle-button" onClick={() => setHelp(true)}>
                                  How it connects <ArrowUpRight size={13} />
                                </button>
                              </div>
                            ) : (
                              sessions.map((session) => (
                                <div
                                  key={session.id}
                                  className={`session ${needsAttention(session) ? 'needs-attention' : ''} ${selected === session.id ? 'selected' : ''}`}
                                >
                                  <button
                                    className="session-button"
                                    aria-expanded={selected === session.id}
                                    onClick={() =>
                                      setSelected(selected === session.id ? null : session.id)
                                    }
                                  >
                                    <ProviderMark provider={session.provider} />
                                    <span className="session-copy">
                                      <strong>{session.project}</strong>
                                      <span>
                                        {session.health === 'live'
                                          ? ACTIVITY[session.activity]
                                          : session.health === 'disconnected'
                                            ? 'Disconnected'
                                            : `Last seen: ${ACTIVITY[session.activity].toLowerCase()}`}
                                      </span>
                                    </span>
                                    <span className="session-meta">
                                      <span>
                                        {session.health === 'live' &&
                                        session.activity === 'approval' ? (
                                          <span className="approval-chip">Review</span>
                                        ) : (
                                          age(session.observedAt, now)
                                        )}
                                      </span>
                                      {selected === session.id ? (
                                        <ChevronUp size={13} />
                                      ) : (
                                        <ChevronDown size={13} />
                                      )}
                                    </span>
                                  </button>
                                  {selected === session.id && (
                                    <div className="session-detail">
                                      <div>
                                        <span>{PROVIDER[session.provider]}</span>
                                        <span>
                                          {session.contextPercent !== undefined
                                            ? `${session.contextPercent}% context used`
                                            : 'Context unavailable'}
                                        </span>
                                      </div>
                                      <button
                                        className="return-button"
                                        disabled={busy || (!preview && !session.terminal)}
                                        onClick={() => void returnToAgent(session)}
                                      >
                                        {!preview && !session.terminal
                                          ? 'Terminal not linked yet'
                                          : 'Return to agent'}
                                        <ArrowUpRight size={14} />
                                      </button>
                                    </div>
                                  )}
                                </div>
                              ))
                            )}
                          </div>
                          <div className="section-heading usage-heading">
                            <h2>SUBSCRIPTION USAGE</h2>
                            <span>{preview && 'Sample values'}</span>
                          </div>
                          <div className="accounts">
                            {snapshot.accounts.map((account) => (
                              <AccountCard key={account.provider} account={account} now={now} />
                            ))}
                          </div>
                        </>
                      )}
                      <footer className="island-footer">
                        <span className="connection-label">
                          <span className={`status-dot ${preview ? 'dim' : ''}`} />
                          {preview
                            ? 'Demo · no live data'
                            : snapshot.bridgeWindows
                              ? `${snapshot.bridgeWindows} VS Code window${snapshot.bridgeWindows > 1 ? 's' : ''} connected`
                              : 'Waiting for VS Code'}
                        </span>
                        <div className="footer-actions">
                          <button
                            className={`icon-button ${snoozed ? 'active' : ''}`}
                            aria-label={snoozed ? 'Resume alerts' : 'Pause alerts'}
                            aria-pressed={snoozed}
                            title={snoozed ? 'Resume alerts' : 'Pause alerts'}
                            onClick={() => {
                              setSnoozed(!snoozed);
                              setNotice(null);
                            }}
                          >
                            {snoozed ? <BellOff size={14} /> : <Bell size={14} />}
                          </button>
                          <button
                            className="icon-button"
                            aria-label="Connection help"
                            aria-pressed={help}
                            onClick={() => setHelp(!help)}
                          >
                            <CircleHelp size={14} />
                          </button>
                          {native && (
                            <button
                              className="icon-button"
                              aria-label="Quit Glim"
                              onClick={() => void quit()}
                            >
                              <Power size={14} />
                            </button>
                          )}
                        </div>
                      </footer>
                    </>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
            {(message || error) && (
              <div className="inline-message" role="status">
                {message || error}
                <button
                  className="icon-button"
                  aria-label="Dismiss message"
                  onClick={() => {
                    setMessage('');
                    setError('');
                  }}
                >
                  <X size={13} />
                </button>
              </div>
            )}
          </motion.section>
        </div>
        <div className="sr-only" role="status" aria-live="polite">
          {notice ? `${notice.project}: ${ACTIVITY[notice.activity]}` : ''}
        </div>
        {preview && (
          <div className="preview-bottom">
            <div className="preview-copy">
              <span className="eyebrow">YOUR AGENTS, AT A GLANCE.</span>
              <h1>
                Your focus.
                <br />
                <span>Uninterrupted.</span>
              </h1>
              <p>
                A small space for what matters.
                <br />A little more room for everything else.
              </p>
            </div>
            <aside className="preview-controls" aria-label="Preview controls">
              <div className="preview-controls-title">
                <span>Try the island</span>
                <span>DEMO</span>
              </div>
              <p>Click the pill above. Explore a few moments below.</p>
              <div className="scenario-buttons">
                <button onClick={() => demo('sessions')}>
                  <Terminal size={14} />6 sessions
                </button>
                <button onClick={() => demo('approval')}>
                  <Bell size={14} />
                  Needs you
                </button>
                <button onClick={() => demo('finished')}>
                  <Check size={14} />
                  Finished response
                </button>
                <button onClick={() => demo('stale')}>
                  <RotateCcw size={14} />
                  Stale readings
                </button>
                <button onClick={() => demo('empty')}>
                  <Minus size={14} />
                  Quiet
                </button>
              </div>
              <small>
                This browser preview uses sample data. Desktop behavior is tested separately.
              </small>
            </aside>
          </div>
        )}
        {selection && <span className="sr-only">Selected {selection.project}</span>}
      </main>
    </MotionConfig>
  );
}
