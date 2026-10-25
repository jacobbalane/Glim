import { useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import {
  AlignHorizontalJustifyCenter,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Check,
  ChevronDown,
  Power,
  ShieldCheck,
} from 'lucide-react';
import type { Update } from '@tauri-apps/plugin-updater';
import { api, mac, native } from './api';
import { AnimatePresence, motion } from 'motion/react';
import QuickOptionsSettings from './QuickOptionsSettings';
import useReducedMotion from './useReducedMotion';
import { Eyes, HelloCharacter } from './Character';
import { Logo, IconButton, Meter, Switch, Segmented } from './island-components';
import { ago, contextMissing, limitName, nameOf, type Group } from './session-presentation';
import { compactNumber, freshInput, totalTokens } from './format';
import {
  PROVIDERS,
  type Connector,
  type Preferences,
  type Provider,
  type DailyUsage,
  type Monitor,
} from './types';
function Sheet({
  title,
  sub,
  end,
  onBack,
  scroll = false,
  children,
  foot,
  bodyLabel,
}: {
  title: string;
  bodyLabel?: string;
  sub?: string;
  end?: ReactNode;
  onBack?: () => void;
  scroll?: boolean;
  children: ReactNode;
  foot?: ReactNode;
}) {
  return (
    <div className="sheet">
      <header className="sheet-head" data-island-drag>
        {onBack && (
          <IconButton label="Back" onClick={onBack}>
            <ArrowLeft size={15} />
          </IconButton>
        )}
        <div className="sheet-title">
          <h2>{title}</h2>
          {sub && <p>{sub}</p>}
        </div>
        {end}
      </header>
      <motion.div
        layoutScroll
        role={bodyLabel ? 'region' : undefined}
        aria-label={bodyLabel}
        className={`sheet-body${scroll ? ' scroll' : ''}`}
      >
        {children}
      </motion.div>
      {foot}
    </div>
  );
}

export function Details({
  group,
  now,
  onBack,
  scroll,
}: {
  group: Group;
  now: number;
  onBack?: () => void;
  scroll?: boolean;
}) {
  const { session: s, look } = group;
  const t = s.tokens;
  const agent = PROVIDERS[s.provider].short;
  const limits = s.limits.filter((limit) => limit.resetsAt > now);
  const done = s.tasks.filter((task) => task.status === 'completed').length;
  const ledger: [string, number | null][] = [
    ['Input', t ? freshInput(t) : null],
    ['Output', t?.output ?? null],
    ['Cache writes', t?.cacheWrite ?? null],
  ];
  const value = (n: number | null) => (n === null ? 'Unavailable' : compactNumber(n));
  return (
    <Sheet
      bodyLabel="Session usage details"
      title={nameOf(group)}
      sub={`${PROVIDERS[s.provider].name} · ${s.model} · started ${ago(now - s.startedAt)} ago`}
      onBack={onBack}
      scroll={scroll}
      end={
        <span className={`chip tone-${look.tone}`}>
          <Eyes mood={look.mood} tone={look.tone} size={24} />
          {look.label}
        </span>
      }
    >
      <section className="sec">
        <h4>Budget</h4>
        <div className="stack">
          <Meter
            large
            label="Context window"
            value={s.contextPercent}
            missing={contextMissing(s)}
            note={
              s.contextPercent === null
                ? undefined
                : s.provider === 'codex'
                  ? 'Estimated from Codex records.'
                  : s.contextEstimated
                    ? 'Estimated from Claude Code records and the model.'
                    : undefined
            }
          />
          {limits.map((limit) => (
            <Meter
              large
              key={limit.label}
              label={limitName(limit.label)}
              value={limit.usedPercent}
              note={`Resets in ${ago(limit.resetsAt - now)}`}
            />
          ))}
          {limits.length === 0 && <p className="fine">{agent} hasn't reported account limits.</p>}
        </div>
      </section>
      {s.tasks.length > 0 && (
        <section className="sec">
          <h4>
            Plan
            <span className="num">
              {done} of {s.tasks.length} done
            </span>
          </h4>
          <ol className="checklist">
            {s.tasks.map((task) => (
              <li key={task.id} className={task.status}>
                <span className="check" aria-hidden="true">
                  {task.status === 'completed' && <Check size={10} strokeWidth={3.2} />}
                </span>
                <span>
                  {task.label}
                  {task.status === 'in_progress' && <span className="sr-only"> (in progress)</span>}
                </span>
              </li>
            ))}
          </ol>
        </section>
      )}
      <section className="sec">
        <h4>Tokens</h4>
        <dl className="ledger">
          {ledger.map(([label, n]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd className="num">{value(n)}</dd>
            </div>
          ))}
          {!!t?.reasoning && (
            <div>
              <dt>Reasoning, within output</dt>
              <dd className="num">{compactNumber(t.reasoning)}</dd>
            </div>
          )}
          <div className="sum">
            <dt>Total</dt>
            <dd className="num">{value(totalTokens(t))}</dd>
          </div>
          <div className="aside">
            <dt>Read from cache</dt>
            <dd className="num">{value(t?.cached ?? null)}</dd>
          </div>
        </dl>
        <p className="fine">
          As {agent} reports them. Cache reads sit outside the total. Not a billing estimate.
        </p>
        {s.measurementNote && <p className="fine">{s.measurementNote}</p>}
      </section>
    </Sheet>
  );
}

export function Connectors({
  list,
  onChange,
  initialOpen = null,
}: {
  list: Connector[];
  onChange: (next: Connector[]) => void;
  initialOpen?: Provider | null;
}) {
  const [open, setOpen] = useState<Provider | null>(initialOpen);
  const [confirm, setConfirm] = useState<Provider | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<Provider | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pending = useRef(false);
  const set = async (c: Connector, enabled: boolean) => {
    if (pending.current) return;
    pending.current = true;
    setBusy(c.provider);
    setError(null);
    setNotice(null);
    try {
      const result = await api.connector(c.provider, enabled);
      onChange(result.connectors);
      setNotice(
        enabled
          ? c.provider === 'codex'
            ? 'Codex hooks added. Finish setup in Codex.'
            : `${PROVIDERS[c.provider].name} connected. ${c.note}`
          : `${PROVIDERS[c.provider].name} disconnected. Its other settings are untouched.`,
      );
      setOpen(enabled && c.provider === 'codex' ? 'codex' : null);
      setConfirm(null);
    } catch (e) {
      setError(String(e));
    } finally {
      pending.current = false;
      setBusy(null);
    }
  };
  return (
    <div className="connectors" aria-busy={busy !== null}>
      {list.length === 0 && <p className="fine">No supported agent installation detected.</p>}
      {list.map((c) => {
        const isOpen = open === c.provider;
        return (
          <div className={`conn${isOpen ? ' open' : ''}`} key={c.provider}>
            <button
              className="conn-head"
              aria-expanded={isOpen}
              disabled={busy !== null}
              onClick={() => {
                setOpen(isOpen ? null : c.provider);
                setConfirm(null);
              }}
            >
              <Logo provider={c.provider} size={20} />
              <span className="conn-name">
                <b>{PROVIDERS[c.provider].name}</b>
                <small>
                  {c.detected ? (c.version ? `v${c.version}` : 'Detected') : 'Not installed'}
                </small>
              </span>
              {c.enabled ? (
                <span className={`conn-status${c.provider === 'codex' ? ' hooks-added' : ''}`}>
                  <i className="dot" />
                  {c.provider === 'codex' ? 'Hooks added' : 'Connected'}
                </span>
              ) : c.detected && !isOpen ? (
                <span className="btn small">{c.provider === 'codex' ? 'Set up' : 'Connect'}</span>
              ) : null}
              <ChevronDown size={15} className="conn-chev" />
            </button>
            {isOpen && (
              <div className="conn-body">
                <p className="conn-lead">{c.enabled ? 'Glim added' : 'Glim will add'}</p>
                <ul>
                  {c.changes.map((change) => (
                    <li key={change}>
                      <Check size={12} strokeWidth={2.6} />
                      {change}
                    </li>
                  ))}
                </ul>
                <code>{c.configPath}</code>
                {(c.enabled || c.provider !== 'codex') && (
                  <p className="fine">
                    {c.enabled ? 'Disconnecting removes only these entries.' : c.note}
                  </p>
                )}
                {c.provider === 'codex' && (
                  <div className="conn-next" aria-label="Codex setup steps">
                    <b>{c.enabled ? 'Finish in Codex' : 'One more step in Codex'}</b>
                    <p>
                      Open the Codex CLI, enter <kbd>/hooks</kbd>, and review and trust the Glim
                      hooks. Then start a new session with Glim running.
                    </p>
                    <p className="fine">
                      Glim can add the hooks, but cannot confirm Codex's trust setting.
                    </p>
                  </div>
                )}
                {c.error && (
                  <p role="alert" className="inline-error">
                    {c.error}
                  </p>
                )}
                <div className="actions">
                  {!c.enabled ? (
                    <button
                      className="btn small primary"
                      disabled={busy !== null || !c.detected}
                      onClick={() => set(c, true)}
                    >
                      {busy === c.provider
                        ? c.provider === 'codex'
                          ? 'Adding hooks…'
                          : 'Connecting…'
                        : c.provider === 'codex'
                          ? 'Add Codex hooks'
                          : `Connect ${PROVIDERS[c.provider].short}`}
                    </button>
                  ) : confirm === c.provider ? (
                    <>
                      <button
                        className="btn small"
                        disabled={busy !== null}
                        onClick={() => setConfirm(null)}
                      >
                        Keep
                      </button>
                      <button
                        className="btn small danger"
                        disabled={busy !== null}
                        onClick={() => set(c, false)}
                      >
                        {busy === c.provider
                          ? 'Removing…'
                          : `Remove from ${c.configPath.split(/[\\/]/).pop()}`}
                      </button>
                    </>
                  ) : (
                    <button className="btn small" onClick={() => setConfirm(c.provider)}>
                      Disconnect…
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        );
      })}
      {error && (
        <p className="inline-error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="notice" role="status">
          <Check size={13} strokeWidth={2.6} />
          {notice}
        </p>
      )}
    </div>
  );
}

// How strongly the island lights up when an agent wants you, from off to very bright. Moving the
// slider lights the island so the strength shows; each change is saved as it comes, the latest
// winning over any still being written.
function GlowField({
  prefs,
  onPrefs,
}: {
  prefs: Preferences;
  onPrefs: (next: Preferences) => Promise<void>;
}) {
  const id = useId();
  const [value, setValue] = useState(prefs.glow ?? 50);
  const [error, setError] = useState<string | null>(null);
  const latest = useRef(prefs);
  latest.current = prefs;
  const queued = useRef<number | null>(null);
  const saving = useRef(false);
  useEffect(() => {
    if (!saving.current && queued.current === null) setValue(prefs.glow ?? 50);
  }, [prefs.glow]);
  const commit = async (glow: number) => {
    queued.current = glow;
    if (saving.current) return;
    saving.current = true;
    while (queued.current !== null) {
      const next = queued.current;
      queued.current = null;
      try {
        await onPrefs({ ...latest.current, glow: next });
        setError(null);
      } catch (e) {
        setError(String(e));
      }
    }
    saving.current = false;
  };
  const shown = value === 0 ? 'Off' : `${value}%`;
  return (
    <>
      <div className="field">
        <label className="field-label" htmlFor={id}>
          Glow
        </label>
        <div className="glow-control">
          <input
            id={id}
            className="glow-range"
            type="range"
            min={0}
            max={100}
            step={5}
            value={value}
            aria-valuetext={shown}
            style={{ '--fill': `${value}%` } as CSSProperties}
            onChange={(e) => {
              const next = Number(e.target.value);
              setValue(next);
              void commit(next);
            }}
          />
          <span className="num glow-value" aria-hidden="true">
            {shown}
          </span>
        </div>
      </div>
      {error && (
        <p className="inline-error" role="alert">
          {error}
        </p>
      )}
    </>
  );
}

function IslandFields({
  prefs,
  onPrefs,
  full,
  onBusyChange,
}: {
  prefs: Preferences;
  onPrefs: (next: Preferences) => Promise<void>;
  full: boolean;
  onBusyChange?: (busy: boolean) => void;
}) {
  const display = useId();
  const reduced = useReducedMotion();
  const [monitors, setMonitors] = useState<Monitor[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pending = useRef(false);
  useEffect(() => {
    let disposed = false;
    if (full)
      api
        .monitors()
        .then((value) => {
          if (!disposed) setMonitors(value);
        })
        .catch((e) => {
          if (!disposed) setError(String(e));
        });
    return () => {
      disposed = true;
    };
  }, [full]);
  const save = async (next: Preferences) => {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError(null);
    onBusyChange?.(true);
    try {
      await onPrefs(next);
    } catch (e) {
      setError(String(e));
    } finally {
      pending.current = false;
      setBusy(false);
      onBusyChange?.(false);
    }
  };
  return (
    <fieldset className="fields" disabled={busy} aria-busy={busy}>
      <div className="field">
        <span className="field-label">When idle</span>
        <Segmented
          label="When idle"
          value={prefs.idleBehavior}
          options={[
            ['pill', 'Keep visible'],
            ['hidden', 'Hide'],
          ]}
          onChange={(idleBehavior) => save({ ...prefs, idleBehavior })}
        />
      </div>
      {full && (
        <div className="field">
          <span className="field-label">Compact</span>
          <Segmented
            label="Compact"
            value={prefs.compactStyle}
            options={[
              ['island', 'Island'],
              ['mini', 'Mini'],
              ['glim', 'Glim only'],
            ]}
            onChange={(compactStyle) => save({ ...prefs, compactStyle })}
          />
        </div>
      )}
      {/* Closed to Glim, the hover switch slides open under the choice it belongs to. */}
      <AnimatePresence initial={false}>
        {full && prefs.compactStyle !== 'island' && (
          <motion.div
            key="hover"
            className="field-reveal"
            initial={{ height: reduced ? 'auto' : 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: reduced ? 'auto' : 0, opacity: 0 }}
            transition={{
              height: { type: 'spring', stiffness: 420, damping: 40 },
              opacity: { duration: reduced ? 0.06 : 0.15 },
            }}
          >
            <Switch
              label="Show the island on hover"
              checked={prefs.hoverOpens}
              onChange={(hoverOpens) => save({ ...prefs, hoverOpens })}
            />
          </motion.div>
        )}
      </AnimatePresence>
      {full && (
        <div className="field">
          <label className="field-label" htmlFor={display}>
            Display
          </label>
          <select
            id={display}
            value={prefs.monitor ?? ''}
            onChange={(e) => save({ ...prefs, monitor: e.target.value || null })}
          >
            <option value="">Primary display</option>
            {monitors.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </div>
      )}
      <Switch
        label={mac ? 'Open at login' : 'Start with Windows'}
        checked={prefs.startAtLogin}
        onChange={(startAtLogin) => save({ ...prefs, startAtLogin })}
      />
      <Switch
        label="Hide over fullscreen apps"
        checked={prefs.hideFullscreen}
        onChange={(hideFullscreen) => save({ ...prefs, hideFullscreen })}
      />
      {full && <GlowField prefs={prefs} onPrefs={onPrefs} />}
      {full && (
        <Switch
          label="Pause monitoring"
          checked={prefs.paused}
          onChange={(paused) => save({ ...prefs, paused })}
        />
      )}
      {error && (
        <p className="inline-error" role="alert">
          {error}
        </p>
      )}
    </fieldset>
  );
}

export function SettingsSheet({
  prefs,
  onPrefs,
  connectors,
  onConnectors,
  onBack,
  onUsage,
  scroll,
  initialOpen,
  initialConfirmClear = false,
}: {
  prefs: Preferences;
  onPrefs: (next: Preferences) => Promise<void>;
  connectors: Connector[];
  onConnectors: (next: Connector[]) => void;
  onBack?: () => void;
  onUsage?: () => void;
  scroll?: boolean;
  initialOpen?: Provider | null;
  initialConfirmClear?: boolean;
}) {
  const [confirmClear, setConfirmClear] = useState(initialConfirmClear);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pending = useRef(false);
  const [cleared, setCleared] = useState(false);
  const [version, setVersion] = useState('');
  const [appBusy, setAppBusy] = useState<'centre' | 'quit' | null>(null);
  const appPending = useRef(false);
  const appAction = async (kind: 'centre' | 'quit') => {
    if (appPending.current) return;
    appPending.current = true;
    setAppBusy(kind);
    setError(null);
    try {
      if (kind === 'centre') await api.islandPosition(0.5);
      else await api.quit();
    } catch (e) {
      setError(String(e));
    } finally {
      appPending.current = false;
      setAppBusy(null);
    }
  };
  useEffect(() => {
    api.version().then(setVersion, () => {});
  }, []);
  return (
    <Sheet title="Settings" onBack={onBack} scroll={scroll}>
      <section className="sec">
        <h4>Agents</h4>
        <Connectors list={connectors} onChange={onConnectors} initialOpen={initialOpen} />
      </section>
      <section className="sec">
        <h4>Island</h4>
        <IslandFields prefs={prefs} onPrefs={onPrefs} full />
        <div className="field">
          <span className="field-label">Position</span>
          <button
            className="btn small"
            disabled={!!appBusy}
            onClick={() => void appAction('centre')}
          >
            <AlignHorizontalJustifyCenter size={14} />
            Centre horizontally
          </button>
        </div>
        <QuickOptionsSettings prefs={prefs} onPrefs={onPrefs} />
      </section>
      <section className="sec">
        <h4>Data</h4>
        <p className="privacy">
          <ShieldCheck size={14} />
          Usage stays on this device for 30 days. No prompts or responses are saved.
        </p>
        <div className="field">
          <span className="field-label">Usage history</span>
          <div className="actions">
            {onUsage && (
              <button className="btn small" onClick={onUsage}>
                View
              </button>
            )}
            {confirmClear ? (
              <>
                <button className="btn small" onClick={() => setConfirmClear(false)}>
                  Keep
                </button>
                <button
                  className="btn small danger"
                  disabled={busy}
                  onClick={async () => {
                    if (pending.current) return;
                    pending.current = true;
                    setBusy(true);
                    setError(null);
                    try {
                      await api.clearHistory();
                      setCleared(true);
                      setConfirmClear(false);
                    } catch (e) {
                      setError(String(e));
                    } finally {
                      pending.current = false;
                      setBusy(false);
                    }
                  }}
                >
                  Clear history
                </button>
              </>
            ) : (
              <button
                className="btn small"
                disabled={cleared}
                onClick={() => setConfirmClear(true)}
              >
                {cleared ? 'Cleared' : 'Clear…'}
              </button>
            )}
          </div>
        </div>
        {confirmClear && (
          <p className="fine">Deletes Glim's saved counters. Agent files stay intact.</p>
        )}
      </section>
      <section className="sec">
        <h4>Updates</h4>
        <Updates />
      </section>
      {error && (
        <p className="inline-error" role="alert">
          {error}
        </p>
      )}
      {cleared && (
        <p className="fine" role="status">
          History cleared.
        </p>
      )}
      <footer className="about">
        <span>Glim {version}</span>
        <div className="actions">
          <button
            className="link"
            onClick={() => api.openRelease().catch((e) => setError(String(e)))}
          >
            Releases <ArrowUpRight size={12} />
          </button>
          <button
            className="link"
            disabled={!native || !!appBusy}
            aria-description={native ? undefined : 'Available in the desktop app'}
            onClick={() => void appAction('quit')}
          >
            <Power size={12} aria-hidden="true" />
            Quit Glim
          </button>
        </div>
      </footer>
    </Sheet>
  );
}

type UpdateState =
  | { kind: 'idle' | 'checking' | 'current' }
  | { kind: 'available' | 'installing'; update: Update; percent: number | null }
  | { kind: 'failed'; message: string };

// A newer Glim from GitHub, only when asked. On Windows, installing hands over to Setup, which
// closes Glim and opens it again on the new version; on macOS the new Glim.app is in place once
// the install finishes, and Glim opens it.
function Updates() {
  const [state, setState] = useState<UpdateState>({ kind: 'idle' });
  const checkNow = async () => {
    setState({ kind: 'checking' });
    try {
      const update = await api.checkUpdate();
      setState(update ? { kind: 'available', update, percent: null } : { kind: 'current' });
    } catch {
      setState({
        kind: 'failed',
        message: 'Could not reach GitHub. Check your connection and try again.',
      });
    }
  };
  const install = async (update: Update) => {
    let total = 0;
    let received = 0;
    setState({ kind: 'installing', update, percent: null });
    try {
      await update.downloadAndInstall((event) => {
        if (event.event === 'Started') total = event.data.contentLength ?? 0;
        if (event.event === 'Progress' && total) {
          received += event.data.chunkLength;
          setState({
            kind: 'installing',
            update,
            percent: Math.min(100, Math.round((received / total) * 100)),
          });
        }
      });
      await api.relaunch();
    } catch {
      setState({
        kind: 'failed',
        message: 'The update could not be installed. Try again, or download it from Releases.',
      });
    }
  };
  const label =
    state.kind === 'checking'
      ? 'Checking…'
      : state.kind === 'current'
        ? 'Glim is up to date'
        : state.kind === 'available'
          ? `Glim ${state.update.version} is available`
          : state.kind === 'installing'
            ? `Downloading${state.percent === null ? '…' : ` ${state.percent}%`}`
            : 'Check for a newer Glim';
  return (
    <>
      <div className="field">
        <span className="field-label" aria-live="polite">
          {label}
        </span>
        <div className="actions">
          {state.kind === 'available' ? (
            <button className="btn small primary" onClick={() => install(state.update)}>
              Update
            </button>
          ) : (
            <button
              className="btn small"
              disabled={state.kind === 'checking' || state.kind === 'installing'}
              onClick={checkNow}
            >
              Check
            </button>
          )}
        </div>
      </div>
      {state.kind === 'failed' ? (
        <p className="inline-error" role="alert">
          {state.message}
        </p>
      ) : (
        <p className="fine">Glim goes online only when you check.</p>
      )}
    </>
  );
}

const dayLabel = (day: string) =>
  new Date(`${day}T12:00:00`).toLocaleDateString('en', { month: 'short', day: 'numeric' });

export function UsageSheet({ onBack, scroll }: { onBack?: () => void; scroll?: boolean }) {
  const [history, setHistory] = useState<DailyUsage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let disposed = false;
    api
      .history()
      .then((value) => {
        if (!disposed) setHistory(value);
      })
      .catch((e) => {
        if (!disposed) setError(String(e));
      })
      .finally(() => {
        if (!disposed) setLoading(false);
      });
    return () => {
      disposed = true;
    };
  }, []);
  const [days, setDays] = useState(14);
  const [agent, setAgent] = useState<'all' | Provider>('all');
  const [hover, setHover] = useState<number | null>(null);
  const series = Array.from({ length: days }, (_, i) => {
    const day = new Date(Date.now() - (days - 1 - i) * 86_400_000).toISOString().slice(0, 10);
    const of = (p: Provider) =>
      agent !== 'all' && agent !== p
        ? 0
        : history
            .filter((h) => h.day === day && h.provider === p)
            .reduce((n, h) => n + (totalTokens(h) ?? 0), 0);
    return { day, claude: of('claude'), codex: of('codex') };
  });
  const rows = history.filter(
    (h) => h.day >= series[0].day && (agent === 'all' || h.provider === agent),
  );
  const sum = (key: 'input' | 'output' | 'cacheWrite' | 'cached') =>
    rows.reduce((n, h) => n + h[key], 0);
  const fresh = freshInput({ input: sum('input'), cached: sum('cached') });
  const total = fresh + sum('output') + sum('cacheWrite');
  const max = Math.max(1, ...series.map((d) => d.claude + d.codex));
  const projects = [...new Set(rows.map((h) => h.project))]
    .map((project) => ({
      project,
      n: rows.filter((h) => h.project === project).reduce((n, h) => n + (totalTokens(h) ?? 0), 0),
    }))
    .sort((a, b) => b.n - a.n);
  const top = Math.max(1, ...projects.map((p) => p.n));
  const focus = hover === null ? null : series[hover];
  return (
    <Sheet title="Usage" onBack={onBack} scroll={scroll}>
      {loading ? (
        <p className="fine" role="status">
          Loading usage…
        </p>
      ) : error ? (
        <p className="inline-error" role="alert">
          {error}
        </p>
      ) : (
        <>
          <div className="usage-filters">
            <Segmented
              label="Period"
              value={days}
              options={[
                [7, '7 days'],
                [14, '14 days'],
                [30, '30 days'],
              ]}
              onChange={setDays}
            />
            <Segmented
              label="Agent"
              value={agent}
              options={[
                ['all', 'All'],
                ['claude', 'Claude'],
                ['codex', 'Codex'],
              ]}
              onChange={setAgent}
            />
          </div>
          <p className="usage-total">
            <b className="num">{compactNumber(total)} tokens</b> in the last {days} days
          </p>
          <p className="usage-split num">
            Input {compactNumber(fresh)} · Output {compactNumber(sum('output'))} · Cache writes{' '}
            {compactNumber(sum('cacheWrite'))} · Read from cache {compactNumber(sum('cached'))}
          </p>
          <div className="chart" onPointerLeave={() => setHover(null)}>
            <p className="chart-readout num" aria-live="polite">
              {focus ? (
                <>
                  <b>{dayLabel(focus.day)}</b>
                  <span>{compactNumber(focus.claude + focus.codex)} tokens</span>
                  {agent !== 'codex' && (
                    <span className="legend claude">Claude {compactNumber(focus.claude)}</span>
                  )}
                  {agent !== 'claude' && (
                    <span className="legend codex">Codex {compactNumber(focus.codex)}</span>
                  )}
                </>
              ) : (
                <>
                  <span>Per day</span>
                  {agent !== 'codex' && <span className="legend claude">Claude</span>}
                  {agent !== 'claude' && <span className="legend codex">Codex</span>}
                </>
              )}
            </p>
            <div
              className="bars"
              role="img"
              aria-label={`Tokens per day for the last ${days} days. Busiest day ${compactNumber(max)}.`}
            >
              <span className="bars-max num">{compactNumber(max)}</span>
              {series.map((d, i) => (
                <div
                  key={d.day}
                  className={`col${i === series.length - 1 ? ' today' : ''}${hover === i ? ' on' : ''}`}
                  onPointerEnter={() => setHover(i)}
                >
                  <div
                    className="bar-stack"
                    style={{ height: `${((d.claude + d.codex) / max) * 100}%` }}
                  >
                    {d.codex > 0 && <i className="bar-seg codex" style={{ flexGrow: d.codex }} />}
                    {d.claude > 0 && (
                      <i className="bar-seg claude" style={{ flexGrow: d.claude }} />
                    )}
                  </div>
                </div>
              ))}
            </div>
            <div className="chart-axis">
              <span>{dayLabel(series[0].day)}</span>
              <span>Today</span>
            </div>
          </div>
          <section className="sec">
            <h4>By project</h4>
            <ul className="projects">
              {projects.map((p) => (
                <li key={p.project}>
                  <span>{p.project}</span>
                  <span className="num">{compactNumber(p.n)}</span>
                  <span className="track" aria-hidden="true">
                    <i style={{ transform: `scaleX(${p.n / top})` }} />
                  </span>
                </li>
              ))}
            </ul>
            {projects.length === 0 && <p className="fine">Nothing recorded in this period.</p>}
          </section>
          <p className="fine">
            Totals count input, output and cache writes as each agent reports them. Not a billing
            estimate.
          </p>
        </>
      )}
    </Sheet>
  );
}

export function SetupSheet({
  prefs,
  onPrefs,
  connectors,
  onConnectors,
  onDone,
  initialStep = 0,
  initialOpen = null,
}: {
  prefs: Preferences;
  onPrefs: (next: Preferences) => Promise<void>;
  connectors: Connector[];
  onConnectors: (next: Connector[]) => void;
  onDone?: () => void;
  initialStep?: number;
  initialOpen?: Provider | null;
}) {
  const [step, setStep] = useState(initialStep);
  const [busy, setBusy] = useState(false);
  const [fieldBusy, setFieldBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pending = useRef(false);
  const finish = async () => {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError(null);
    try {
      await onPrefs({ ...prefs, onboardingComplete: true });
      onDone?.();
    } catch (e) {
      setError(String(e));
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };
  return (
    <Sheet
      title="Set up Glim"
      end={
        <span className="steps" role="img" aria-label={`Step ${step + 1} of 3`}>
          {[0, 1, 2].map((i) => (
            <i key={i} className={i <= step ? 'on' : ''} />
          ))}
        </span>
      }
      foot={
        step > 0 && (
          <footer className="setup-foot">
            <button className="link" disabled={busy || fieldBusy} onClick={() => setStep(step - 1)}>
              <ArrowLeft size={13} /> Back
            </button>
            <button
              className="btn primary"
              disabled={busy || fieldBusy}
              onClick={() => (step === 2 ? finish() : setStep(step + 1))}
            >
              {busy ? 'Saving…' : step === 2 ? 'Done' : 'Continue'} <ArrowRight size={14} />
            </button>
          </footer>
        )
      }
    >
      {error && (
        <p className="inline-error" role="alert">
          {error}
        </p>
      )}
      {step === 0 && (
        <div className="welcome">
          <HelloCharacter size={128} />
          <h1>Glim</h1>
          <p>A glimpse at your agents.</p>
          <button className="btn primary large" onClick={() => setStep(1)}>
            Get started <ArrowRight size={15} />
          </button>
          <small>Local. No extra account.</small>
        </div>
      )}
      {step === 1 && (
        <>
          <div className="setup-intro">
            <h3>Connect your agents</h3>
            <p>Glim shows every change before it makes it, and keeps a backup.</p>
          </div>
          <Connectors list={connectors} onChange={onConnectors} initialOpen={initialOpen} />
        </>
      )}
      {step === 2 && (
        <>
          <div className="setup-intro">
            <h3>The island</h3>
            <p>All of this lives in Settings later.</p>
          </div>
          <IslandFields prefs={prefs} onPrefs={onPrefs} full={false} onBusyChange={setFieldBusy} />
        </>
      )}
    </Sheet>
  );
}
