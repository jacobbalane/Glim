// Claude's proposal for the Glim island. Preview-only: the app never imports this folder.
// Data, types and number formatting come from src/ unchanged, so the proposal shows real states.
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type Ref,
} from 'react';
import {
  AnimatePresence,
  animate,
  motion,
  useIsPresent,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
  type MotionValue,
} from 'motion/react';
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  ChartColumn,
  Check,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Settings2,
  ShieldCheck,
} from 'lucide-react';
import { compactNumber, elapsed, totalTokens } from '../src/format';
import { previewHistory, previewSessions } from '../src/preview';
import {
  PROVIDERS,
  type Connector,
  type Preferences,
  type Provider,
  type Session,
} from '../src/types';
import { Eyes, type Mood, type Tone } from './brand';

/* ------------------------------------------------------------------ */
/* State language: colour means state, never brand.                    */
/* ------------------------------------------------------------------ */

export type View = 'compact' | 'glance' | 'details' | 'settings' | 'usage' | 'setup';
interface Look {
  label: string;
  tone: Tone;
  mood: Mood;
  rank: number;
}
export interface Group {
  session: Session;
  look: Look;
  children: Session[];
}

function lookOf(s: Session, seenAt: number): Look {
  switch (s.activity) {
    case 'waiting':
      return {
        label: /answer|question|input/i.test(s.detail)
          ? 'Needs an answer'
          : s.detail === 'Agent needs your attention'
            ? 'Needs you'
            : 'Needs approval',
        tone: 'attention',
        mood: 'wide',
        rank: 0,
      };
    case 'error':
      return { label: 'Error', tone: 'error', mood: 'cross', rank: 1 };
    case 'idle':
      // A handed-back turn stays green until the island is opened, then settles.
      return s.updatedAt > seenAt
        ? { label: 'Your turn', tone: 'success', mood: 'happy', rank: 2 }
        : { label: 'Ready', tone: 'calm', mood: 'open', rank: 6 };
    case 'working':
      return { label: 'Working', tone: 'active', mood: 'scan', rank: 3 };
    case 'interrupted':
      return { label: 'Interrupted', tone: 'calm', mood: 'half', rank: 4 };
    case 'finished':
      return { label: 'Done', tone: 'done', mood: 'happy', rank: 5 };
    default:
      return { label: 'Quiet', tone: 'off', mood: 'closed', rank: 7 };
  }
}

// Subagents fold into their parent; the most urgent agent always leads.
export function groupSessions(sessions: Session[], seenAt: number): Group[] {
  const ids = new Set(sessions.map((s) => s.id));
  return sessions
    .filter((s) => !s.parentId || !ids.has(s.parentId))
    .map((session) => ({
      session,
      look: lookOf(session, seenAt),
      children: sessions.filter((child) => child.parentId === session.id),
    }))
    .sort((a, b) => a.look.rank - b.look.rank || b.session.updatedAt - a.session.updatedAt);
}

function ago(ms: number) {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 5) return 'now';
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
}
function timeOf(s: Session, now: number) {
  if (s.activity === 'working') return elapsed(s.startedAt, now);
  const since = ago(now - s.updatedAt);
  if (s.activity === 'waiting' || since === 'now') return since;
  return `${since} ago`;
}
/* ------------------------------------------------------------------ */
/* The notch: working agents take turns; anything else interrupts     */
/* once, then waits in the banner below until it is handled.           */
/* ------------------------------------------------------------------ */

const ROTATE_MS = 6000;
const DONE_WINDOW = 10 * 60 * 1000;
// Blocked and failed agents hold the notch longest; a stopped turn barely interrupts.
function holdOf(s: Session) {
  if (s.activity === 'waiting' || s.activity === 'error') return 7000;
  return s.activity === 'interrupted' ? 3500 : 5000;
}
// Anything that is not working and worth knowing. Finished turns stop being news once seen.
function isNotice(g: Group, seenAt: number, now: number) {
  const s = g.session;
  if (s.activity === 'waiting' || s.activity === 'error') return true;
  const fresh = s.updatedAt > seenAt && now - s.updatedAt < DONE_WINDOW;
  return (
    fresh && (s.activity === 'idle' || s.activity === 'finished' || s.activity === 'interrupted')
  );
}

export interface NotchView {
  current?: Group;
  mode: 'notice' | 'rotate' | 'rest';
  working: Group[];
  inbox: Group[];
}
// What the notch shows: a notice being presented, else the working agents in turn, else the
// most urgent thing at rest. The banner holds the docked notices the notch is not showing.
export function notchView(
  groups: Group[],
  seenAt: number,
  now: number,
  rotation = 0,
  presentingId: string | null = null,
  docked?: Set<string>,
): NotchView {
  const working = groups
    .filter((g) => g.session.activity === 'working')
    .sort((a, b) => a.session.project.localeCompare(b.session.project));
  const notices = groups.filter((g) => isNotice(g, seenAt, now));
  const presenting = notices.find((g) => g.session.id === presentingId);
  const isDocked = (g: Group) => !docked || docked.has(g.session.id);
  let current: Group | undefined;
  let mode: NotchView['mode'];
  if (presenting) {
    current = presenting;
    mode = 'notice';
  } else if (working.length) {
    current = working[rotation % working.length];
    mode = 'rotate';
  } else {
    current = notices.find(isDocked) ?? groups[0];
    mode = 'rest';
  }
  const inbox = notices.filter((g) => g !== current && isDocked(g));
  return { current, mode, working, inbox };
}

type NotchState = {
  known: Map<string, string> | null;
  queue: string[];
  presenting: { id: string; until: number } | null;
  docked: Set<string>;
  rotation: number;
  next: number;
};
// Puts the most urgent queued notice in the notch for its hold time.
function presentNext(s: NotchState, groups: Group[], at: number) {
  const rank = (id: string) => groups.findIndex((g) => g.session.id === id);
  s.queue.sort((a, b) => rank(a) - rank(b));
  const id = s.queue.shift();
  const group = groups.find((g) => g.session.id === id);
  if (id && group) s.presenting = { id, until: at + holdOf(group.session) };
}

function useNotch(
  groups: Group[],
  seenAt: number,
  { running, held, dwell }: { running: boolean; held: boolean; dwell: number },
): NotchView {
  const [, redraw] = useState(0);
  const latest = useRef({ groups, held, dwell, running });
  latest.current = { groups, held, dwell, running };
  const state = useRef<NotchState>({
    known: null,
    queue: [],
    presenting: null,
    docked: new Set<string>(),
    rotation: 0,
    next: Date.now() + ROTATE_MS,
  });
  const now = Date.now();
  const keys = groups
    .filter((g) => isNotice(g, seenAt, now))
    .map((g) => `${g.session.id}:${g.session.activity}:${g.session.updatedAt}`)
    .join('|');
  useLayoutEffect(() => {
    const s = state.current;
    const at = Date.now();
    const next = new Map<string, string>();
    for (const g of latest.current.groups)
      if (isNotice(g, seenAt, at))
        next.set(g.session.id, `${g.session.activity}:${g.session.updatedAt}`);
    // Notices that were already there when Glim started are not news; they start docked.
    if (!s.known) next.forEach((_, id) => s.docked.add(id));
    else
      next.forEach((key, id) => {
        if (s.known!.get(id) === key || s.queue.includes(id) || s.presenting?.id === id) return;
        s.docked.delete(id);
        s.queue.push(id);
      });
    for (const id of [...s.docked]) if (!next.has(id)) s.docked.delete(id);
    s.queue = s.queue.filter((id) => next.has(id));
    if (s.presenting && !next.has(s.presenting.id)) s.presenting = null;
    s.known = next;
    // Present right away rather than on the next tick, so the change is one morph.
    if (latest.current.running && !s.presenting && s.queue.length)
      presentNext(s, latest.current.groups, at);
    redraw((n) => n + 1);
  }, [keys, seenAt]);
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => {
      if (document.hidden) return;
      const s = state.current;
      const { groups, held, dwell } = latest.current;
      const at = Date.now();
      let changed = false;
      if (s.presenting && at >= s.presenting.until) {
        // Pointing at a notice keeps it in the notch until you look away.
        if (held) s.presenting.until = at + 400;
        else {
          s.docked.add(s.presenting.id);
          s.presenting = null;
          s.next = at + dwell;
          changed = true;
        }
      }
      if (!s.presenting && s.queue.length) {
        presentNext(s, groups, at);
        changed = true;
      }
      if (!s.presenting && !held && at >= s.next) {
        const working = groups.filter((g) => g.session.activity === 'working').length;
        if (working > 1) {
          s.rotation = (s.rotation + 1) % working;
          changed = true;
        }
        s.next = at + dwell;
      }
      if (changed) redraw((n) => n + 1);
    }, 250);
    return () => clearInterval(timer);
  }, [running]);
  const s = state.current;
  return notchView(groups, seenAt, now, s.rotation, s.presenting?.id ?? null, s.docked);
}

function limitName(label: string) {
  return /limit/i.test(label) ? label : `${label.replace(/^(\d+) (hour|day)$/, '$1-$2')} limit`;
}
function plural(n: number, word: string) {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

/* ------------------------------------------------------------------ */
/* Sample scenarios, rebased from src/preview.ts                       */
/* ------------------------------------------------------------------ */

export const T0 = Date.now();
const ORIGIN = previewSessions[0].updatedAt;
export function sample(id: string, t: number, patch: Partial<Session> = {}): Session {
  const base = previewSessions.find((s) => s.id === id);
  if (!base) throw new Error(`Unknown sample session: ${id}`);
  const shift = t - ORIGIN;
  const s = structuredClone(base);
  return {
    ...s,
    startedAt: s.startedAt + shift,
    updatedAt: s.updatedAt + shift,
    limits: s.limits.map((limit) => ({ ...limit, resetsAt: limit.resetsAt + shift })),
    ...patch,
  };
}
function subagent(id: string, t: number, detail: string, startedAgo: number): Session {
  return sample('demo-claude', t, {
    id,
    parentId: 'demo-claude',
    detail,
    startedAt: t - startedAgo,
    updatedAt: t - 2000,
    tokens: { input: 6200, output: 900, cached: 4100, cacheWrite: 0, reasoning: 0 },
    contextPercent: 7,
    tasks: [],
    limits: [],
  });
}
export const allDone = (s: Session): Session['tasks'] =>
  s.tasks.map((task) => ({ ...task, status: 'completed' }));

export type ScenarioKey =
  'several' | 'working' | 'long' | 'approval' | 'turn' | 'error' | 'paused' | 'empty';
interface Scenario {
  label: string;
  paused?: boolean;
  build: (t: number) => Session[];
}
export const SCENARIOS: Record<ScenarioKey, Scenario> = {
  // Three agents working in turn, one approval already waiting in the banner.
  several: {
    label: 'Several agents',
    build: (t) => [
      sample('demo-claude', t),
      sample('demo-codex', t, { activity: 'working', detail: 'Running a command', updatedAt: t }),
      sample('demo-claude-2', t, { activity: 'working', detail: 'Editing files', updatedAt: t }),
      sample('demo-codex', t, { id: 'demo-docs', project: 'docs-site', updatedAt: t - 128_000 }),
      subagent('demo-sub-explore', t, 'Exploring files', 96_000),
      subagent('demo-sub-tests', t, 'Running a command', 51_000),
    ],
  },
  working: { label: 'Working', build: (t) => [sample('demo-claude', t)] },
  long: {
    label: 'Long task',
    build: (t) => [
      sample('demo-claude', t, {
        tasks: [
          { id: '1', label: 'Build the desktop shell', status: 'completed' },
          {
            id: '2',
            label:
              'Move the island redesign into the app and update every UI test that depends on it',
            status: 'in_progress',
          },
          { id: '3', label: 'Verify the installer', status: 'pending' },
        ],
      }),
    ],
  },
  approval: {
    label: 'Needs approval',
    build: (t) => [sample('demo-codex', t, { updatedAt: t - 128_000 }), sample('demo-claude', t)],
  },
  turn: {
    label: 'Your turn',
    build: (t) => [
      sample('demo-claude', t, {
        activity: 'idle',
        detail: 'Turn finished',
        updatedAt: t - 9000,
        tasks: allDone(previewSessions[0]),
      }),
    ],
  },
  error: {
    label: 'Error',
    build: (t) => [
      sample('demo-claude', t, {
        activity: 'error',
        detail: 'Agent reported an error',
        updatedAt: t - 14_000,
      }),
    ],
  },
  paused: { label: 'Paused', paused: true, build: (t) => [sample('demo-claude', t)] },
  empty: { label: 'No agents', build: () => [] },
};

/* ------------------------------------------------------------------ */
/* Small parts                                                        */
/* ------------------------------------------------------------------ */

function Logo({ provider, size = 18 }: { provider: Provider; size?: number }) {
  // Codex artwork ships on black; a luminance mask keeps only the knot on any surface.
  return provider === 'claude' ? (
    <img
      className="logo"
      src={`${import.meta.env.BASE_URL}providers/claude.svg`}
      width={size}
      height={size}
      alt=""
      draggable={false}
    />
  ) : (
    <span className="logo logo-codex" style={{ width: size, height: size }} aria-hidden="true" />
  );
}

function IconButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick?: () => void;
  children: ReactNode;
}) {
  return (
    <button className="icon-btn" aria-label={label} title={label} onClick={onClick}>
      {children}
    </button>
  );
}

function Meter({
  label,
  value,
  note,
  large = false,
}: {
  label: string;
  value: number | null;
  note?: string;
  large?: boolean;
}) {
  const fill =
    value === null ? 'none' : value >= 90 ? 'error' : value >= 75 ? 'attention' : 'plain';
  return (
    <div className={`meter${large ? ' large' : ''}`}>
      <div className="meter-row">
        <span>{label}</span>
        {value === null ? (
          <b className="na">Unavailable</b>
        ) : (
          <b className="num">{Math.round(value)}%</b>
        )}
      </div>
      <div
        className="track"
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={value === null ? undefined : Math.round(value)}
      >
        <i className={`fill-${fill}`} style={{ transform: `scaleX(${(value ?? 0) / 100})` }} />
      </div>
      {note && <small>{note}</small>}
    </div>
  );
}

// The notch line: the project stays put and the status after it scrolls. Text that fits sets
// the island's width; a status past the cap scrolls instead, so the island never grows beyond
// it. Mount it with a key per text so each change starts from the left.
function Ticker({
  title,
  children,
  onRun,
  ref,
}: {
  title: ReactNode;
  children?: ReactNode;
  onRun?: (px: number) => void;
  ref?: Ref<HTMLSpanElement>;
}) {
  const reduced = useReducedMotion();
  const ink = useContext(Ink);
  const present = useIsPresent();
  const box = useRef<HTMLSpanElement>(null);
  const copy = useRef<HTMLSpanElement>(null);
  const [run, setRun] = useState(0);
  // New text waits until the island has reached its new width, then fades in. Once it has
  // been shown it stays, so a width change caused by something else never blinks it.
  // The short guard lets the new width be measured before "settled" means anything.
  const settled = useMotionValue(ink ? 0 : 1);
  useEffect(() => {
    if (!ink) return;
    const start = performance.now();
    let frame = requestAnimationFrame(function wait() {
      if (performance.now() - start > 90 && ink.settle.get() > 0.97) {
        animate(settled, 1, { duration: reduced ? 0 : 0.18, ease: [0.23, 1, 0.32, 1] });
        return;
      }
      frame = requestAnimationFrame(wait);
    });
    return () => cancelAnimationFrame(frame);
  }, [ink, settled, reduced]);
  // The notch stays on a scrolling text long enough to read it once.
  useEffect(() => onRun?.(run), [run, onRun]);
  useLayoutEffect(() => {
    const b = box.current;
    const c = copy.current;
    if (!b || !c || reduced) return;
    const measure = () => setRun(c.scrollWidth > b.clientWidth + 1 ? c.offsetWidth : 0);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(b);
    observer.observe(c);
    return () => observer.disconnect();
  }, [reduced]);
  return (
    <motion.span
      ref={ref}
      className="compact-text"
      aria-live={present ? 'polite' : undefined}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: present ? 0.2 : 0.12, ease: [0.23, 1, 0.32, 1] }}
    >
      <motion.span className="compact-line" style={{ opacity: present ? settled : 1 }}>
        <b className="compact-title">{title}</b>
        {children && (
          <span ref={box} className={`ticker-box${run ? ' is-marquee' : ''}`}>
            <span
              className="ticker"
              style={
                run
                  ? ({
                      '--run': `${run}px`,
                      '--speed': `${Math.max(6, run / 40)}s`,
                    } as CSSProperties)
                  : undefined
              }
            >
              <span className="ticker-copy" ref={copy}>
                {children}
              </span>
              {run > 0 && (
                <span className="ticker-copy" aria-hidden="true">
                  {children}
                </span>
              )}
            </span>
          </span>
        )}
      </motion.span>
    </motion.span>
  );
}

export function Switch({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  const id = useId();
  return (
    <div className="field">
      <label className="field-label" htmlFor={id}>
        {label}
      </label>
      <button
        id={id}
        className="switch"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
      >
        <i />
      </button>
    </div>
  );
}

function Segmented<T extends string | number>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: [T, string][];
  onChange: (value: T) => void;
}) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {options.map(([option, text]) => (
        <button key={option} aria-pressed={option === value} onClick={() => onChange(option)}>
          {text}
        </button>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Compact: the notch row, and the banner of what is waiting for you   */
/* ------------------------------------------------------------------ */

export function Compact({
  view,
  paused,
  now,
  onOpen,
  onRun,
}: {
  view: NotchView;
  paused: boolean;
  now: number;
  onOpen?: (id?: string) => void;
  onRun?: (px: number) => void;
}) {
  const ink = useContext(Ink);
  const top = paused ? undefined : view.current;
  const s = top?.session;
  const tone: Tone = !top ? 'calm' : top.look.tone;
  const mood: Mood = paused ? 'closed' : top ? top.look.mood : 'open';
  const title = paused ? 'Monitoring paused' : s ? s.project : 'No agents running';
  // While working, the current plan step says more than the tool category does.
  const step = s?.tasks.find((task) => task.status === 'in_progress')?.label;
  const status = !top || !s ? null : s.activity === 'working' ? (step ?? s.detail) : top.look.label;
  const inbox = paused ? [] : view.inbox;
  let end: ReactNode = null;
  if (top && view.mode === 'rotate' && view.working.length > 1) {
    // One dot per working agent; the lit one is on screen now.
    end = (
      <span className="dots turn" aria-hidden="true">
        {view.working.slice(0, 5).map((g) => (
          <i key={g.session.id} className={`dot${g === top ? ' on' : ''}`} />
        ))}
      </span>
    );
  } else if (s && s.activity === 'waiting') {
    end = <span className="num state-text">{ago(now - s.updatedAt)}</span>;
  } else if (s && s.tasks.length > 0) {
    const done = s.tasks.filter((task) => task.status === 'completed').length;
    end = (
      <span className="num">
        {done}/{s.tasks.length}
      </span>
    );
  }
  const agents = view.working.length + inbox.length + (view.mode === 'rotate' ? 0 : 1);
  return (
    <div className="compact-wrap">
      <button
        className={`compact tone-${tone}`}
        onClick={() => onOpen?.(s?.id)}
        data-session-id={s?.id}
        aria-expanded={false}
        aria-label={`Glim: ${title}${status ? `, ${status}` : ''}. ${plural(agents, 'agent')}. Open.`}
        title={status ? `${title} · ${status}` : title}
      >
        <Eyes mood={mood} tone={tone} size={28} />
        {/* The old text fades out while the island changes width; the new one follows. */}
        <AnimatePresence initial={false} mode="popLayout">
          <Ticker key={`${s?.id}|${title}|${status}`} title={title} onRun={onRun}>
            {status && <span className="state-text">{status}</span>}
          </Ticker>
        </AnimatePresence>
        {end && (
          <motion.span className="compact-end" style={{ opacity: ink?.settle ?? 1 }}>
            {end}
          </motion.span>
        )}
      </button>
      {/* Notices land here after their turn in the notch, and stay until handled. */}
      <ul className="inbox" aria-label="Waiting for you">
        <AnimatePresence initial={false}>
          {inbox.slice(0, 3).map((g) => (
            <motion.li
              key={g.session.id}
              initial={{ opacity: 0, y: -12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              // Rows land once the island has had a moment to make room for them.
              transition={{ duration: 0.32, delay: 0.18, ease: [0.23, 1, 0.32, 1] }}
            >
              <button
                className={`inbox-row tone-${g.look.tone}`}
                onClick={() => onOpen?.(g.session.id)}
                aria-label={`${g.session.project}: ${g.look.label}. Open.`}
              >
                <i className="dot" aria-hidden="true" />
                <span className="inbox-name">{g.session.project}</span>
                <span className="state-text">{g.look.label}</span>
                <span className="inbox-time num">{timeOf(g.session, now)}</span>
              </button>
            </motion.li>
          ))}
        </AnimatePresence>
        {inbox.length > 3 && (
          <li>
            <button className="inbox-more" onClick={() => onOpen?.(inbox[3].session.id)}>
              {inbox.length - 3} more
            </button>
          </li>
        )}
      </ul>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Glance: one agent in depth, every other agent one row each          */
/* ------------------------------------------------------------------ */

function Hero({ group, now, onDetails }: { group: Group; now: number; onDetails?: () => void }) {
  const { session: s, look, children } = group;
  const current = s.tasks.find((task) => task.status === 'in_progress');
  const done = s.tasks.filter((task) => task.status === 'completed').length;
  const step = current ? s.tasks.indexOf(current) + 1 : done;
  const nextLabel =
    current?.label ?? s.tasks.find((task) => task.status === 'pending')?.label ?? 'All steps done';
  const limit = s.limits.find((item) => item.resetsAt > now);
  const total = totalTokens(s.tokens);
  const agent = PROVIDERS[s.provider].short;
  const hint =
    s.activity === 'waiting'
      ? `Respond in ${agent} to keep it going.`
      : s.activity === 'error'
        ? `Open the ${agent} session to see what failed.`
        : null;
  return (
    <section className={`hero tone-${look.tone}`} aria-label={`${s.project}: ${look.label}`}>
      <div className="hero-head">
        <Logo provider={s.provider} size={20} />
        <h3 title={s.project}>{s.project}</h3>
        <span className="chip">
          <Eyes mood={look.mood} tone={look.tone} size={24} />
          {look.label}
        </span>
      </div>
      <div className="hero-body">
        <p className="hero-now">
          <span>{s.detail}</span>
          <span className="num">{timeOf(s, now)}</span>
        </p>
        {hint && <p className="hero-hint">{hint}</p>}
        {s.tasks.length > 0 && (
          <div className="task">
            <span className="task-label" title={nextLabel}>
              {nextLabel}
            </span>
            <span className="pips" aria-hidden="true">
              {s.tasks.map((task) => (
                <i key={task.id} className={task.status} />
              ))}
            </span>
            <span className="task-count num" aria-label={`Step ${step} of ${s.tasks.length}`}>
              {step}/{s.tasks.length}
            </span>
          </div>
        )}
        <div className="meters">
          <Meter
            label="Context"
            value={s.contextPercent}
            note={s.provider === 'codex' && s.contextPercent !== null ? 'Estimated' : undefined}
          />
          {limit && (
            <Meter
              label={limitName(limit.label)}
              value={limit.usedPercent}
              note={`Resets in ${ago(limit.resetsAt - now)}`}
            />
          )}
        </div>
        {children.length > 0 && (
          <div className="subs">
            <span className="subs-title">{plural(children.length, 'subagent')}</span>
            <ul>
              {children.map((child) => {
                const childLook = lookOf(child, Infinity);
                return (
                  <li key={child.id} className={`tone-${childLook.tone}`}>
                    <i className="dot" />
                    <span>{child.detail}</span>
                    <span className="num">{timeOf(child, now)}</span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
        <footer className="hero-foot">
          <span className="num">
            {total === null ? 'Tokens unavailable' : `${compactNumber(total)} tokens`} · {s.model}
          </span>
          {onDetails && (
            <button className="link" onClick={onDetails}>
              Details <ChevronRight size={13} />
            </button>
          )}
        </footer>
      </div>
    </section>
  );
}

function Empty() {
  return (
    <div className="empty">
      <Eyes mood="open" tone="calm" size={60} follow />
      <div>
        <h3>No agents running</h3>
        <p>Start Claude Code or Codex as usual. Glim lights up when they do.</p>
      </div>
    </div>
  );
}

export function Glance({
  groups,
  focusId = null,
  now,
  paused,
  onFocus,
  onDetails,
  onUsage,
  onSettings,
  onCollapse,
  onResume,
}: {
  groups: Group[];
  focusId?: string | null;
  now: number;
  paused: boolean;
  onFocus?: (id: string) => void;
  onDetails?: (id: string) => void;
  onUsage?: () => void;
  onSettings?: () => void;
  onCollapse?: () => void;
  onResume?: () => void;
}) {
  const focus = groups.find((g) => g.session.id === focusId) ?? groups[0];
  const others = groups.filter((g) => g !== focus);
  const waiting = groups.filter((g) => g.look.tone === 'attention').length;
  const errors = groups.filter((g) => g.look.tone === 'error').length;
  return (
    <div className={`glance${paused ? ' is-paused' : ''}`}>
      <header className="bar">
        <p className="bar-title">
          <span>{groups.length ? plural(groups.length, 'agent') : 'Glim'}</span>
          {waiting > 0 && (
            <span className="tone-attention state-text">
              {waiting} need{waiting === 1 ? 's' : ''} you
            </span>
          )}
          {errors > 0 && <span className="tone-error state-text">{plural(errors, 'error')}</span>}
        </p>
        <div className="bar-actions">
          <IconButton label="Usage" onClick={onUsage}>
            <ChartColumn size={15} />
          </IconButton>
          <IconButton label="Settings" onClick={onSettings}>
            <Settings2 size={15} />
          </IconButton>
          <IconButton label="Collapse" onClick={onCollapse}>
            <ChevronUp size={16} />
          </IconButton>
        </div>
      </header>
      {paused && (
        <div className="paused">
          <Eyes mood="closed" tone="calm" size={24} />
          <span>Monitoring is paused. What you see is frozen.</span>
          <button className="btn small" onClick={onResume}>
            Resume
          </button>
        </div>
      )}
      <div className="glance-body">
        {focus ? (
          <Hero
            group={focus}
            now={now}
            onDetails={onDetails && (() => onDetails(focus.session.id))}
          />
        ) : (
          <Empty />
        )}
        {others.length > 0 && (
          <ul className="others">
            {others.map(({ session: s, look, children }) => (
              <li key={s.id}>
                <button
                  className={`row tone-${look.tone}`}
                  onClick={() => onFocus?.(s.id)}
                  aria-label={`${s.project}, ${PROVIDERS[s.provider].name}: ${look.label}`}
                >
                  <Logo provider={s.provider} size={16} />
                  <span className="row-name">{s.project}</span>
                  {children.length > 0 && <span className="row-badge num">+{children.length}</span>}
                  <span className="row-state">
                    <i className="dot" />
                    {look.label}
                  </span>
                  <span className="row-time num">{timeOf(s, now)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Sheets: details, settings, usage, setup                             */
/* ------------------------------------------------------------------ */

function Sheet({
  title,
  sub,
  end,
  onBack,
  scroll = false,
  children,
  foot,
}: {
  title: string;
  sub?: string;
  end?: ReactNode;
  onBack?: () => void;
  scroll?: boolean;
  children: ReactNode;
  foot?: ReactNode;
}) {
  return (
    <div className="sheet">
      <header className="sheet-head">
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
      <div className={`sheet-body${scroll ? ' scroll' : ''}`}>{children}</div>
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
    ['Input', t?.input ?? null],
    ['Output', t?.output ?? null],
    ['Cache writes', t?.cacheWrite ?? null],
  ];
  const value = (n: number | null) => (n === null ? 'Unavailable' : compactNumber(n));
  return (
    <Sheet
      title={s.project}
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
            note={
              s.provider === 'codex' && s.contextPercent !== null
                ? 'Estimated from Codex records.'
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
  const set = (c: Connector, enabled: boolean) => {
    onChange(list.map((item) => (item.provider === c.provider ? { ...item, enabled } : item)));
    setNotice(
      enabled
        ? `${PROVIDERS[c.provider].name} connected. ${c.note}`
        : `${PROVIDERS[c.provider].name} disconnected. Its other settings are untouched.`,
    );
    setOpen(null);
    setConfirm(null);
  };
  return (
    <div className="connectors">
      {list.map((c) => {
        const isOpen = open === c.provider;
        return (
          <div className={`conn${isOpen ? ' open' : ''}`} key={c.provider}>
            <button
              className="conn-head"
              aria-expanded={isOpen}
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
                <span className="conn-status tone-success">
                  <i className="dot" />
                  Connected
                </span>
              ) : c.detected && !isOpen ? (
                <span className="btn small">Connect</span>
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
                <p className="fine">
                  {c.enabled ? 'Disconnecting removes only these entries.' : c.note}
                </p>
                <div className="actions">
                  {!c.enabled ? (
                    <button
                      className="btn small primary"
                      disabled={!c.detected}
                      onClick={() => set(c, true)}
                    >
                      Connect {PROVIDERS[c.provider].short}
                    </button>
                  ) : confirm === c.provider ? (
                    <>
                      <button className="btn small" onClick={() => setConfirm(null)}>
                        Keep
                      </button>
                      <button className="btn small danger" onClick={() => set(c, false)}>
                        Remove from {c.configPath.split('/').pop()}
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
      {notice && (
        <p className="notice" role="status">
          <Check size={13} strokeWidth={2.6} />
          {notice}
        </p>
      )}
    </div>
  );
}

function IslandFields({
  prefs,
  onPrefs,
  full,
}: {
  prefs: Preferences;
  onPrefs: (next: Preferences) => void;
  full: boolean;
}) {
  const display = useId();
  return (
    <>
      <div className="field">
        <span className="field-label">When idle</span>
        <Segmented
          label="When idle"
          value={prefs.idleBehavior}
          options={[
            ['pill', 'Keep visible'],
            ['hidden', 'Hide'],
          ]}
          onChange={(idleBehavior) => onPrefs({ ...prefs, idleBehavior })}
        />
      </div>
      {full && (
        <div className="field">
          <label className="field-label" htmlFor={display}>
            Display
          </label>
          <select
            id={display}
            value={prefs.monitor ?? ''}
            onChange={(e) => onPrefs({ ...prefs, monitor: e.target.value || null })}
          >
            <option value="">Primary display</option>
          </select>
        </div>
      )}
      <Switch
        label="Start with Windows"
        checked={prefs.startAtLogin}
        onChange={(startAtLogin) => onPrefs({ ...prefs, startAtLogin })}
      />
      <Switch
        label="Hide over fullscreen apps"
        checked={prefs.hideFullscreen}
        onChange={(hideFullscreen) => onPrefs({ ...prefs, hideFullscreen })}
      />
      {full && (
        <Switch
          label="Pause monitoring"
          checked={prefs.paused}
          onChange={(paused) => onPrefs({ ...prefs, paused })}
        />
      )}
    </>
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
}: {
  prefs: Preferences;
  onPrefs: (next: Preferences) => void;
  connectors: Connector[];
  onConnectors: (next: Connector[]) => void;
  onBack?: () => void;
  onUsage?: () => void;
  scroll?: boolean;
  initialOpen?: Provider | null;
}) {
  const [confirmClear, setConfirmClear] = useState(false);
  const [cleared, setCleared] = useState(false);
  return (
    <Sheet title="Settings" onBack={onBack} scroll={scroll}>
      <section className="sec">
        <h4>Agents</h4>
        <Connectors list={connectors} onChange={onConnectors} initialOpen={initialOpen} />
      </section>
      <section className="sec">
        <h4>Island</h4>
        <IslandFields prefs={prefs} onPrefs={onPrefs} full />
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
                  onClick={() => {
                    setCleared(true);
                    setConfirmClear(false);
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
      <footer className="about">
        <span>Glim 0.1.0</span>
        <a
          className="link"
          href="https://github.com/jacobbalane/Glim/releases"
          target="_blank"
          rel="noreferrer"
        >
          Releases <ArrowUpRight size={12} />
        </a>
      </footer>
    </Sheet>
  );
}

const dayLabel = (day: string) =>
  new Date(`${day}T12:00:00`).toLocaleDateString('en', { month: 'short', day: 'numeric' });

export function UsageSheet({ onBack, scroll }: { onBack?: () => void; scroll?: boolean }) {
  const [days, setDays] = useState(14);
  const [agent, setAgent] = useState<'all' | Provider>('all');
  const [hover, setHover] = useState<number | null>(null);
  const series = Array.from({ length: days }, (_, i) => {
    const day = new Date(T0 - (days - 1 - i) * 86_400_000).toISOString().slice(0, 10);
    const of = (p: Provider) =>
      agent !== 'all' && agent !== p
        ? 0
        : previewHistory
            .filter((h) => h.day === day && h.provider === p)
            .reduce((n, h) => n + h.input + h.output + h.cacheWrite, 0);
    return { day, claude: of('claude'), codex: of('codex') };
  });
  const rows = previewHistory.filter(
    (h) => h.day >= series[0].day && (agent === 'all' || h.provider === agent),
  );
  const sum = (key: 'input' | 'output' | 'cacheWrite' | 'cached') =>
    rows.reduce((n, h) => n + h[key], 0);
  const total = sum('input') + sum('output') + sum('cacheWrite');
  const max = Math.max(1, ...series.map((d) => d.claude + d.codex));
  const projects = [...new Set(rows.map((h) => h.project))]
    .map((project) => ({
      project,
      n: rows
        .filter((h) => h.project === project)
        .reduce((n, h) => n + h.input + h.output + h.cacheWrite, 0),
    }))
    .sort((a, b) => b.n - a.n);
  const top = Math.max(1, ...projects.map((p) => p.n));
  const focus = hover === null ? null : series[hover];
  return (
    <Sheet title="Usage" onBack={onBack} scroll={scroll}>
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
        Input {compactNumber(sum('input'))} · Output {compactNumber(sum('output'))} · Cache writes{' '}
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
                {d.claude > 0 && <i className="bar-seg claude" style={{ flexGrow: d.claude }} />}
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
  onPrefs: (next: Preferences) => void;
  connectors: Connector[];
  onConnectors: (next: Connector[]) => void;
  onDone?: () => void;
  initialStep?: number;
  initialOpen?: Provider | null;
}) {
  const [step, setStep] = useState(initialStep);
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
            <button className="link" onClick={() => setStep(step - 1)}>
              <ArrowLeft size={13} /> Back
            </button>
            <button
              className="btn primary"
              onClick={() => (step === 2 ? onDone?.() : setStep(step + 1))}
            >
              {step === 2 ? 'Done' : 'Continue'} <ArrowRight size={14} />
            </button>
          </footer>
        )
      }
    >
      {step === 0 && (
        <div className="welcome">
          <Eyes mood="open" tone="brand" size={128} follow />
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
          <IslandFields prefs={prefs} onPrefs={onPrefs} full={false} />
        </>
      )}
    </Sheet>
  );
}

/* ------------------------------------------------------------------ */
/* Surfaces                                                           */
/* ------------------------------------------------------------------ */

// Compact islands size to their text; expanded ones take the width they are given.
export function StaticIsland({
  width,
  tone,
  compact = false,
  children,
}: {
  width?: number;
  tone?: Tone;
  compact?: boolean;
  children: ReactNode;
}) {
  return (
    <div
      className={`gl shell static${compact ? ' is-compact' : ''}`}
      data-tone={tone}
      data-compact={compact}
      style={width ? { width } : undefined}
    >
      <span className="shoulder l" aria-hidden="true" />
      <span className="shoulder r" aria-hidden="true" />
      <div className="surface">{children}</div>
    </div>
  );
}

const SPRING = { type: 'spring', stiffness: 420, damping: 40, mass: 1 } as const;
const COMPACT_MIN = 144;
const COMPACT_MAX = 360;
const COMPACT_H = 34;
// compact/expanded fade content in and out with the width spring; settle is 1 when the width
// has arrived where it is going, and falls to 0 while it is still on its way.
const Ink = createContext<{
  compact: MotionValue<number>;
  expanded: MotionValue<number>;
  settle: MotionValue<number>;
} | null>(null);

// Each view keeps the width it was born with, so an exiting view never reflows. The compact
// view is the exception: it is as wide as its text, up to `width`, and reports what it takes.
function ViewFrame({
  width,
  fit,
  compact,
  reduced,
  onSize,
  children,
}: {
  width: number;
  fit: boolean;
  compact: boolean;
  reduced: boolean;
  onSize: (width: number, height: number) => void;
  children: ReactNode;
}) {
  const ink = useContext(Ink);
  const present = useIsPresent();
  const ref = useRef<HTMLDivElement>(null);
  const report = useRef(onSize);
  report.current = onSize;
  useLayoutEffect(() => {
    const el = ref.current;
    if (!present || !el) return;
    const send = () => report.current(el.offsetWidth, el.offsetHeight);
    send();
    const observer = new ResizeObserver(send);
    observer.observe(el);
    return () => observer.disconnect();
  }, [present]);
  return (
    <motion.div
      ref={ref}
      className="frame"
      style={
        fit
          ? { width: 'max-content', minWidth: COMPACT_MIN, maxWidth: width, left: 0 }
          : { width, marginLeft: -width / 2 }
      }
      inert={!present}
      initial={{ opacity: 0, filter: 'blur(3px)' }}
      animate={{ opacity: 1, filter: 'blur(0px)' }}
      exit={{ opacity: 0, filter: 'blur(3px)' }}
      transition={{ duration: reduced ? 0.06 : 0.2, ease: [0.23, 1, 0.32, 1] }}
    >
      <motion.div style={{ opacity: ink ? (compact ? ink.compact : ink.expanded) : 1 }}>
        {children}
      </motion.div>
    </motion.div>
  );
}

export function LiveIsland({
  sessions,
  seenAt,
  onSeen,
  view,
  onView,
  prefs,
  onPrefs,
  connectors,
  onConnectors,
  maxWidth,
}: {
  sessions: Session[];
  seenAt: number;
  onSeen: (time: number) => void;
  view: View;
  onView: (view: View) => void;
  prefs: Preferences;
  onPrefs: (next: Preferences) => void;
  connectors: Connector[];
  onConnectors: (next: Connector[]) => void;
  maxWidth: number;
}) {
  const reduced = !!useReducedMotion();
  const shell = useRef<HTMLDivElement>(null);
  const returnFocus = useRef(false);
  const [now, setNow] = useState(Date.now);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [held, setHeld] = useState(false);
  const [run, setRun] = useState(0);
  const groups = groupSessions(sessions, seenAt);
  const focus = groups.find((g) => g.session.id === focusId) ?? groups[0];
  const expanded = view !== 'compact';
  // Only the compact island takes turns, and never while the pointer rests on it.
  const notch = useNotch(groups, seenAt, {
    running: !expanded && !prefs.paused,
    held,
    dwell: Math.max(ROTATE_MS, 2600 + (run / 40) * 1000),
  });
  const wide = Math.max(COMPACT_MIN + 60, Math.min(440, maxWidth));
  // The compact island follows its text between these bounds and never nears the expanded width.
  const cap = Math.min(COMPACT_MAX, wide - 60);
  const [fitted, setFitted] = useState(300);
  const width = expanded ? wide : Math.max(COMPACT_MIN, Math.min(cap, fitted));

  const w = useSpring(width, SPRING);
  const h = useSpring(COMPACT_H, SPRING);
  // Ink follows the real spring position: compact text leaves early, expanded text arrives late.
  const radius = useTransform(w, [cap, Math.max(wide, cap + 1)], [17, 24]);
  const compactInk = useTransform(w, [cap, cap + 26], [1, 0]);
  const expandedInk = useTransform(w, [wide - 30, wide], [0, 1]);
  const settle = useTransform(w, (value) =>
    Math.max(0, Math.min(1, 1 - (Math.abs(value - width) - 3) / 16)),
  );
  useLayoutEffect(() => {
    if (reduced) w.jump(width);
    else w.set(width);
  }, [width, reduced, w]);
  const onSize = (frameWidth: number, frameHeight: number) => {
    if (!expanded) setFitted(Math.ceil(frameWidth));
    if (reduced) h.jump(frameHeight);
    else h.set(frameHeight);
  };

  const collapse = useCallback(() => {
    onView('compact');
    onSeen(Date.now());
    setFocusId(null);
  }, [onView, onSeen]);

  useEffect(() => {
    const clock = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(clock);
  }, []);
  useEffect(() => {
    if (view !== 'compact' || !returnFocus.current) return;
    returnFocus.current = false;
    requestAnimationFrame(() => shell.current?.querySelector<HTMLElement>('.compact')?.focus());
  }, [view]);
  useEffect(() => {
    if (!expanded) return;
    const key = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (view === 'glance') {
        returnFocus.current = true;
        collapse();
      } else onView('glance');
    };
    const outside = (event: PointerEvent) => {
      const target = event.target as Element;
      if (shell.current?.contains(target) || target.closest?.('[data-keep-open]')) return;
      collapse();
    };
    document.addEventListener('keydown', key);
    document.addEventListener('pointerdown', outside);
    return () => {
      document.removeEventListener('keydown', key);
      document.removeEventListener('pointerdown', outside);
    };
  }, [expanded, view, collapse, onView]);

  const back = () => onView('glance');
  let content: ReactNode;
  if (view === 'compact') {
    content = (
      <Compact
        view={notch}
        paused={prefs.paused}
        now={now}
        onRun={setRun}
        onOpen={(id) => {
          if (id) setFocusId(id);
          onView('glance');
        }}
      />
    );
  } else if (view === 'details' && focus) {
    content = <Details group={focus} now={now} onBack={back} scroll />;
  } else if (view === 'settings') {
    content = (
      <SettingsSheet
        prefs={prefs}
        onPrefs={onPrefs}
        connectors={connectors}
        onConnectors={onConnectors}
        onBack={back}
        onUsage={() => onView('usage')}
        scroll
      />
    );
  } else if (view === 'usage') {
    content = <UsageSheet onBack={back} scroll />;
  } else if (view === 'setup') {
    content = (
      <SetupSheet
        prefs={prefs}
        onPrefs={onPrefs}
        connectors={connectors}
        onConnectors={onConnectors}
        onDone={back}
      />
    );
  } else {
    content = (
      <Glance
        groups={groups}
        focusId={focus?.session.id}
        now={now}
        paused={prefs.paused}
        onFocus={setFocusId}
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
  }

  const tone: Tone = prefs.paused || !notch.current ? 'calm' : notch.current.look.tone;
  return (
    <motion.div
      ref={shell}
      className={`gl shell live${expanded ? '' : ' is-compact'}`}
      data-tone={tone}
      data-compact={!expanded}
      style={{ width: w, height: h }}
      onPointerEnter={() => setHeld(true)}
      onPointerLeave={() => setHeld(false)}
    >
      <span className="shoulder l" aria-hidden="true" />
      <span className="shoulder r" aria-hidden="true" />
      <motion.div
        className="surface"
        style={{ borderBottomLeftRadius: radius, borderBottomRightRadius: radius }}
      >
        <Ink.Provider value={{ compact: compactInk, expanded: expandedInk, settle }}>
          <AnimatePresence initial={false}>
            <ViewFrame
              key={view === 'details' ? `details-${focus?.session.id}` : view}
              width={expanded ? width : cap}
              fit={!expanded}
              compact={!expanded}
              reduced={reduced}
              onSize={onSize}
            >
              {content}
            </ViewFrame>
          </AnimatePresence>
        </Ink.Provider>
      </motion.div>
    </motion.div>
  );
}
