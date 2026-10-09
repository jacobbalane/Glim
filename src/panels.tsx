import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import useReducedMotion from './useReducedMotion';
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Download,
  ExternalLink,
  Link2,
  Loader2,
  ShieldCheck,
  Trash2,
  Unplug,
} from 'lucide-react';
import { api, demo } from './api';
import { AccentButton, AgentTile, GlimMark, Toggle } from './components';
import Mascot from './Mascot';
import { compactNumber } from './format';
import {
  PROVIDERS,
  type Connector,
  type DailyUsage,
  type Monitor,
  type Preferences,
  type Provider,
  type Snapshot,
} from './types';

export function SettingsPanel({
  snapshot,
  onboarding,
  onDone,
  onHistory,
  initialStep = 0,
  initialConnector = null,
  initialConfirmClear = false,
  stillMascot = false,
}: {
  snapshot: Snapshot;
  onboarding: boolean;
  onDone: () => void;
  onHistory: () => void;
  initialStep?: number;
  initialConnector?: Provider | null;
  initialConfirmClear?: boolean;
  stillMascot?: boolean;
}) {
  const [step, setStep] = useState(initialStep);
  const reduced = useReducedMotion() || stillMascot;
  const [busy, setBusy] = useState<Provider | 'preferences' | 'clear' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [monitors, setMonitors] = useState<Monitor[]>([]);
  const [confirmClear, setConfirmClear] = useState(initialConfirmClear);
  const [expandedConnector, setExpandedConnector] = useState<Provider | null>(initialConnector);
  useEffect(() => {
    api
      .monitors()
      .then(setMonitors)
      .catch((e) => setError(String(e)));
  }, []);
  async function save(patch: Partial<Preferences>) {
    setBusy('preferences');
    setError(null);
    try {
      await api.savePreferences({ ...snapshot.preferences, ...patch });
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(null);
    }
  }
  async function connector(c: Connector) {
    setBusy(c.provider);
    setError(null);
    try {
      await api.connector(c.provider, !c.enabled);
      setNotice(
        c.enabled
          ? `${PROVIDERS[c.provider].name} disconnected.`
          : `${PROVIDERS[c.provider].name} connected. ${c.note}`,
      );
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(null);
    }
  }
  async function finish() {
    setBusy('preferences');
    try {
      await api.savePreferences({ ...snapshot.preferences, onboardingComplete: true });
      onDone();
    } catch (e) {
      setError(String(e));
      setBusy(null);
    }
  }
  const connectorSection = (
    <section className="panel-section">
      <div className="section-heading">
        <div>
          <h2>Agents</h2>
        </div>
        {!onboarding && (
          <button className="text-button" onClick={onHistory}>
            History <ArrowUpRight size={12} />
          </button>
        )}
      </div>
      {snapshot.connectors.length === 0 && (
        <p className="inline-note">
          {demo
            ? 'Loading connectors…'
            : 'No supported agent installation detected. Install Claude Code or Codex CLI, then reopen settings.'}
        </p>
      )}
      {snapshot.connectors.map((c) => (
        <div className="connector-card" key={c.provider}>
          <div className="connector-summary">
            <AgentTile provider={c.provider} small />
            <div className="connector-name">
              <strong>{PROVIDERS[c.provider].name}</strong>
              <span>
                {c.detected
                  ? c.version
                    ? `v${c.version}`
                    : 'Detected on this device'
                  : 'Not installed'}
                {c.enabled ? ' · Connected' : ''}
              </span>
            </div>
            <button
              className="secondary-button connector-button"
              disabled={busy !== null || (!c.detected && !c.enabled)}
              onClick={() =>
                c.enabled
                  ? connector(c)
                  : expandedConnector === c.provider
                    ? connector(c)
                    : setExpandedConnector(c.provider)
              }
            >
              {busy === c.provider ? (
                <Loader2 size={13} className="spin" />
              ) : c.enabled ? (
                <Check size={13} />
              ) : (
                <Link2 size={13} />
              )}{' '}
              {c.enabled ? 'Connected' : expandedConnector === c.provider ? 'Confirm' : 'Connect'}
            </button>
            <button
              className="icon-button"
              aria-label={`Details for ${PROVIDERS[c.provider].name}`}
              onClick={() =>
                setExpandedConnector(expandedConnector === c.provider ? null : c.provider)
              }
            >
              <ChevronDown size={15} className={expandedConnector === c.provider ? 'rotate' : ''} />
            </button>
          </div>
          {expandedConnector === c.provider && (
            <div className="connector-details">
              <span className="eyebrow">
                {c.enabled ? 'INSTALLED CONNECTION' : 'GLIM WILL ADD'}
              </span>
              <ul>
                {c.changes.map((change) => (
                  <li key={change}>
                    <Check size={12} />
                    {change}
                  </li>
                ))}
              </ul>
              <code>{c.configPath}</code>
              <p>{c.note}</p>
              {c.error && <p className="inline-error">{c.error}</p>}
              {c.enabled && (
                <button
                  className="text-button"
                  disabled={busy !== null}
                  onClick={() => connector(c)}
                >
                  <Unplug size={12} />
                  Disconnect
                </button>
              )}
            </div>
          )}
        </div>
      ))}
    </section>
  );
  const preferencesSection = (
    <section className="panel-section">
      <div className="section-heading">
        <div>
          <h2>Island</h2>
        </div>
      </div>
      <div className="setting-row">
        <div>
          <label htmlFor="idle-select">When idle</label>
        </div>
        <select
          id="idle-select"
          value={snapshot.preferences.idleBehavior}
          disabled={busy !== null}
          onChange={(e) => save({ idleBehavior: e.target.value as Preferences['idleBehavior'] })}
        >
          <option value="pill">Keep visible</option>
          <option value="hidden">Hide</option>
        </select>
      </div>
      <Toggle
        label="Start with Windows"
        checked={snapshot.preferences.startAtLogin}
        onChange={(v) => save({ startAtLogin: v })}
      />
      <Toggle
        label="Hide over fullscreen apps"
        checked={snapshot.preferences.hideFullscreen}
        onChange={(v) => save({ hideFullscreen: v })}
      />
      {!onboarding && (
        <>
          <div className="setting-row">
            <div>
              <label htmlFor="monitor-select">Display</label>
            </div>
            <select
              id="monitor-select"
              value={snapshot.preferences.monitor ?? ''}
              disabled={busy !== null}
              onChange={(e) => save({ monitor: e.target.value || null })}
            >
              <option value="">Primary display</option>
              {monitors.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </div>
          <Toggle
            label="Pause monitoring"
            checked={snapshot.preferences.paused}
            onChange={(v) => save({ paused: v })}
          />
        </>
      )}
    </section>
  );
  return (
    <div className="panel-body">
      {onboarding && (
        <div className="onboarding-progress" aria-label={`Setup step ${step + 1} of 3`}>
          {['Welcome', 'Agents', 'Island'].map((label, i) => (
            <span key={label} className={i <= step ? 'current' : ''}>
              <i>{i < step ? <Check size={10} /> : i + 1}</i>
              {label}
            </span>
          ))}
        </div>
      )}
      <AnimatePresence initial={false} mode="popLayout">
        <motion.div
          key={onboarding ? step : 'settings'}
          initial={{ opacity: 0, y: reduced ? 0 : 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: reduced ? 0 : 4 }}
          transition={{ duration: reduced ? 0.08 : 0.18 }}
        >
          {onboarding && step === 0 ? (
            <div className="welcome">
              <Mascot still={stillMascot} />
              <h1>Glim</h1>
              <p>A glimpse at your agents.</p>
              <AccentButton onClick={() => setStep(1)}>
                Get started <ArrowRight size={15} />
              </AccentButton>
              <span className="welcome-note">Local. No extra account.</span>
            </div>
          ) : (
            <>
              {(!onboarding || step === 1) && connectorSection}
              {(!onboarding || step === 2) && preferencesSection}
              {!onboarding && (
                <section className="panel-section">
                  <div className="section-heading">
                    <div>
                      <h2>Data</h2>
                    </div>
                    <ShieldCheck size={19} className="muted" />
                  </div>
                  <div className="privacy-note">
                    <p>
                      Usage stays on this device for 30 days. No prompts or responses are saved.
                    </p>
                  </div>
                  <div className="setting-row">
                    <div>
                      <strong>Clear usage history</strong>
                      <p>Delete Glim’s saved counters. Agent files stay intact.</p>
                    </div>
                    <button
                      className={`secondary-button ${confirmClear ? 'danger' : ''}`}
                      disabled={busy !== null}
                      onClick={async () => {
                        if (!confirmClear) {
                          setConfirmClear(true);
                          return;
                        }
                        setBusy('clear');
                        try {
                          await api.clearHistory();
                          setNotice('Usage history cleared.');
                          setConfirmClear(false);
                        } catch (e) {
                          setError(String(e));
                        } finally {
                          setBusy(null);
                        }
                      }}
                    >
                      <Trash2 size={13} />
                      {confirmClear ? 'Confirm clear' : 'Clear history'}
                    </button>
                  </div>
                  {confirmClear && (
                    <button className="text-button" onClick={() => setConfirmClear(false)}>
                      Cancel
                    </button>
                  )}
                  <div className="setting-row">
                    <div>
                      <strong>Glim 0.1.0</strong>
                    </div>
                    <button
                      className="secondary-button"
                      onClick={() => api.openRelease().catch((e) => setError(String(e)))}
                    >
                      <Download size={13} />
                      Releases <ExternalLink size={11} />
                    </button>
                  </div>
                </section>
              )}
            </>
          )}
          {error && (
            <p role="alert" className="inline-error">
              {error}
            </p>
          )}
          {notice && (
            <p role="status" className="inline-notice">
              <CheckCircle2 size={15} />
              {notice}
            </p>
          )}
          {onboarding && step > 0 && (
            <footer className="setup-footer">
              <button
                className="text-button"
                disabled={busy !== null}
                onClick={() => setStep(step - 1)}
              >
                <ArrowLeft size={13} />
                Back
              </button>
              <AccentButton
                disabled={busy !== null}
                onClick={() => (step === 1 ? setStep(2) : finish())}
              >
                {busy === 'preferences' ? <Loader2 size={14} className="spin" /> : null}
                {step === 2 ? 'Done' : 'Continue'}
                <ArrowRight size={14} />
              </AccentButton>
            </footer>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

export function HistoryPanel({ onBack }: { onBack: () => void }) {
  const [history, setHistory] = useState<DailyUsage[]>([]);
  const [provider, setProvider] = useState('all');
  const [project, setProject] = useState('all');
  const [days, setDays] = useState(14);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api
      .history()
      .then(setHistory)
      .catch((e) => setError(String(e)));
  }, []);
  const projects = [...new Set(history.map((h) => h.project))].sort();
  const filtered = useMemo(() => {
    const cutoff = new Date(Date.now() - (days - 1) * 86400000).toISOString().slice(0, 10);
    return history.filter(
      (h) =>
        h.day >= cutoff &&
        (provider === 'all' || h.provider === provider) &&
        (project === 'all' || h.project === project),
    );
  }, [history, provider, project, days]);
  const input = filtered.reduce((sum, h) => sum + h.input, 0);
  const output = filtered.reduce((sum, h) => sum + h.output, 0);
  const cached = filtered.reduce((sum, h) => sum + h.cached, 0);
  const writes = filtered.reduce((sum, h) => sum + h.cacheWrite, 0);
  const chart = Array.from({ length: days }, (_, i) => {
    const day = new Date(Date.now() - (days - 1 - i) * 86400000).toISOString().slice(0, 10);
    return {
      day,
      claude: filtered
        .filter((h) => h.day === day && h.provider === 'claude')
        .reduce((sum, h) => sum + h.input + h.output + h.cacheWrite, 0),
      codex: filtered
        .filter((h) => h.day === day && h.provider === 'codex')
        .reduce((sum, h) => sum + h.input + h.output + h.cacheWrite, 0),
    };
  });
  const max = Math.max(1, ...chart.map((d) => d.claude + d.codex));
  return (
    <div className="panel-body history-body">
      <div className="section-heading">
        <div>
          <h1>Usage</h1>
        </div>
      </div>
      <div className="history-filters">
        <select
          aria-label="Filter by agent"
          value={provider}
          onChange={(e) => setProvider(e.target.value)}
        >
          <option value="all">All agents</option>
          <option value="claude">Claude Code</option>
          <option value="codex">Codex</option>
        </select>
        <select
          aria-label="Filter by project"
          value={project}
          onChange={(e) => setProject(e.target.value)}
        >
          <option value="all">All projects</option>
          {projects.map((p) => (
            <option key={p}>{p}</option>
          ))}
        </select>
        <select
          aria-label="History period"
          value={days}
          onChange={(e) => setDays(Number(e.target.value))}
        >
          <option value={7}>Last 7 days</option>
          <option value={14}>Last 14 days</option>
          <option value={30}>Last 30 days</option>
        </select>
      </div>
      <div className="history-metrics">
        <div>
          <span>Total tokens</span>
          <strong>{compactNumber(input + output + writes)}</strong>
        </div>
        <div>
          <span>Input</span>
          <strong>{compactNumber(input)}</strong>
        </div>
        <div>
          <span>Output</span>
          <strong>{compactNumber(output)}</strong>
        </div>
        <div>
          <span>Cached reads</span>
          <strong>{compactNumber(cached)}</strong>
        </div>
      </div>
      <section className="chart-section">
        <header>
          <h2>Daily usage</h2>
          <div className="chart-legend">
            <span>
              <i className="claude" />
              Claude
            </span>
            <span>
              <i className="codex" />
              Codex
            </span>
          </div>
        </header>
        <div
          className="usage-chart"
          role="img"
          aria-label={`Daily token usage for the last ${days} days; total ${input + output + writes} tokens.`}
        >
          <div className="chart-grid">
            <span>{compactNumber(max)}</span>
            <span>{compactNumber(max / 2)}</span>
            <span>0</span>
          </div>
          <div className="chart-bars">
            {chart.map((d) => (
              <div
                className="chart-column"
                key={d.day}
                title={`${d.day}: Claude ${d.claude.toLocaleString()}, Codex ${d.codex.toLocaleString()} tokens`}
              >
                <div
                  className="bar-stack"
                  style={{
                    height: `${Math.max(d.claude + d.codex > 0 ? 2 : 0, ((d.claude + d.codex) / max) * 100)}%`,
                  }}
                >
                  <span className="bar-codex" style={{ flex: d.codex }} />
                  <span className="bar-claude" style={{ flex: d.claude }} />
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="chart-dates">
          <span>
            {new Date(chart[0].day + 'T12:00:00').toLocaleDateString('en', {
              month: 'short',
              day: 'numeric',
            })}
          </span>
          <span>Today</span>
        </div>
        {filtered.length === 0 && (
          <p className="inline-note">
            No recorded usage yet. Connect an agent and start a session.
          </p>
        )}
      </section>
      <section className="history-table">
        <h2>By agent</h2>
        {(['claude', 'codex'] as const)
          .filter((p) => provider === 'all' || provider === p)
          .map((p) => {
            const rows = filtered.filter((h) => h.provider === p);
            return (
              <div className="usage-agent-row" key={p}>
                <AgentTile provider={p} small />
                <strong>{PROVIDERS[p].name}</strong>
                <span>
                  {compactNumber(
                    rows.reduce((sum, h) => sum + h.input + h.output + h.cacheWrite, 0),
                  )}{' '}
                  tokens
                </span>
              </div>
            );
          })}
      </section>
      <p className="history-note">
        <CircleHelp size={13} />
        Reported tokens, including cache reads and reasoning. Not a billing estimate.
      </p>
      {error && (
        <p role="alert" className="inline-error">
          {error}
        </p>
      )}
      <button className="text-button" onClick={onBack}>
        <ArrowLeft size={12} />
        Settings
      </button>
    </div>
  );
}
