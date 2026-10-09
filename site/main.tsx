// Glim's website. It has its own dev server (npm run site, port 3000) and build (npm run
// site:build); the desktop app never loads it. The island at the top is the real redesigned
// component from ../preview-claude, running on sample sessions. This file only drives it through
// its props; nothing in ../preview-claude or ../src changes for the website.
import {
  StrictMode,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { createRoot } from 'react-dom/client';
import { ArrowUpRight, Download, Github } from 'lucide-react';
import '@fontsource-variable/manrope';
import '../preview-claude/style.css';
import './site.css';
import { previewConnectors } from '../src/preview';
import {
  DEFAULT_PREFERENCES,
  type Connector,
  type Preferences,
  type Session,
  type Task,
} from '../src/types';
import {
  allDone,
  Compact,
  Glance,
  groupSessions,
  LiveIsland,
  notchView,
  sample,
  SCENARIOS,
  StaticIsland,
  T0,
  type View,
} from '../preview-claude/island';
import { Eyes } from '../preview-claude/brand';

// Public files, relative to wherever the site is served from.
const ASSETS = import.meta.env.BASE_URL;
const REPO = 'https://github.com/jacobbalane/Glim';
const DOWNLOAD = `${REPO}/releases/latest`;
const SEEN = T0 - 60_000;
const PREFS: Preferences = { ...DEFAULT_PREFERENCES, onboardingComplete: true };
const motionOk = () => !window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// Sections arrive as they scroll in, but only where the browser can animate them.
if ('IntersectionObserver' in window && motionOk())
  document.documentElement.classList.add('can-reveal');

const at = (i: number) => ({ '--i': i }) as CSSProperties;

function useMedia(query: string) {
  const [match, setMatch] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const media = window.matchMedia(query);
    const change = () => setMatch(media.matches);
    media.addEventListener('change', change);
    return () => media.removeEventListener('change', change);
  }, [query]);
  return match;
}

// Scales a fixed-width render down to its column, never up.
function Fit({ width, children }: { width: number; children: ReactNode }) {
  const outer = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ scale: 1, height: 0 });
  useLayoutEffect(() => {
    const o = outer.current;
    const i = inner.current;
    if (!o || !i) return;
    const update = () => {
      const scale = Math.min(1, o.clientWidth / width);
      setBox({ scale, height: i.offsetHeight * scale });
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(o);
    observer.observe(i);
    return () => observer.disconnect();
  }, [width]);
  return (
    <div ref={outer} className="fit" style={{ height: box.height || undefined }}>
      <div
        ref={inner}
        className="fit-inner"
        style={{ width, transform: `translateX(-50%) scale(${box.scale})` }}
      >
        {children}
      </div>
    </div>
  );
}

/* ---------------- Sample agents ---------------- */

type Build = (t: number) => Session[];
const finished = (t: number) => allDone(sample('demo-claude', t));
const working: Build = (t) => [sample('demo-claude', t)];
const yourTurn: Build = (t) => [
  sample('demo-claude', t, {
    activity: 'idle',
    detail: 'Turn finished',
    updatedAt: t - 9000,
    tasks: finished(t),
  }),
];
// glim-desktop leads here: it has the plan, the meters and two subagents.
const detailed: Build = (t) =>
  SCENARIOS.several
    .build(t)
    .filter((s) => s.id !== 'demo-docs')
    .map((s) =>
      s.id === 'demo-claude'
        ? { ...s, updatedAt: t }
        : s.parentId
          ? s
          : { ...s, updatedAt: t - 4000 },
    );

interface State {
  title: string;
  note: string;
  build: Build;
  paused?: boolean;
}
const STATES: State[] = [
  { title: 'Working', note: 'Blue. Its eyes glance side to side while it works.', build: working },
  {
    title: 'Needs approval',
    note: 'Amber, with light under the island. The count is how long it has waited.',
    build: (t) => [sample('demo-codex', t, { updatedAt: t - 128_000 })],
  },
  { title: 'Your turn', note: 'Green when an agent hands the turn back to you.', build: yourTurn },
  {
    title: 'Error',
    note: 'Red, with crossed eyes and a short shake until the agent moves on.',
    build: (t) => [
      sample('demo-claude', t, {
        activity: 'error',
        detail: 'Agent reported an error',
        updatedAt: t - 14_000,
      }),
    ],
  },
  {
    title: 'Done',
    note: 'Teal. The session ended and nothing is waiting on you.',
    build: (t) => [
      sample('demo-claude', t, {
        activity: 'finished',
        detail: 'Session ended',
        updatedAt: t - 300_000,
        tasks: finished(t),
      }),
    ],
  },
  {
    title: 'Several agents',
    note: 'Working agents take turns, one dot each. What needs you waits underneath.',
    build: (t) => SCENARIOS.several.build(t),
  },
  {
    title: 'Long task',
    note: 'A long task scrolls past. The project name stays put.',
    build: (t) => SCENARIOS.long.build(t),
  },
  {
    title: 'Paused',
    note: 'Closed eyes and a slow breath until you resume.',
    build: working,
    paused: true,
  },
];
const TOUR_MS = 4000;
// The hero's agents keep an uneven pace, like real work.
const jitter = (ms: number) => ms * (0.8 + Math.random() * 0.45);
const pick = <T,>(list: T[]) => list[Math.floor(Math.random() * list.length)];

/* ---------------- The hero's agents, left to themselves ---------------- */

const WORK = ['Thinking', 'Editing files', 'Running a command', 'Reading files', 'Exploring files'];
// What a working agent can stop for, and how often.
const STOPS: [number, Partial<Session>][] = [
  [5, { activity: 'waiting', detail: 'Waiting for approval' }],
  [2, { activity: 'waiting', detail: 'Agent needs your attention' }],
  [5, { activity: 'idle', detail: 'Turn finished' }],
  [3, { activity: 'error', detail: 'Agent reported an error' }],
  [2, { activity: 'interrupted', detail: 'Turn interrupted' }],
  [2, { activity: 'finished', detail: 'Session ended' }],
];
function stop(): Partial<Session> {
  let roll = Math.random() * STOPS.reduce((sum, [weight]) => sum + weight, 0);
  for (const [weight, event] of STOPS) if ((roll -= weight) < 0) return event;
  return STOPS[0][1];
}
// A finished plan starts over when its agent goes back to work.
function restart(tasks: Task[]): Task[] {
  if (!tasks.length || tasks.some((t) => t.status !== 'completed')) return tasks;
  return tasks.map((t, i) => ({ ...t, status: i ? 'pending' : 'in_progress' }));
}
// The next step of the plan. Finishing the last step hands the turn back.
function advance(s: Session): Partial<Session> {
  const i = s.tasks.findIndex((t) => t.status === 'in_progress');
  if (i < 0) return { detail: pick(WORK.filter((d) => d !== s.detail)) };
  const tasks = s.tasks.map((t, j): Task =>
    j === i ? { ...t, status: 'completed' } : j === i + 1 ? { ...t, status: 'in_progress' } : t,
  );
  return i === s.tasks.length - 1
    ? { activity: 'idle', detail: 'Turn finished', tasks }
    : { detail: pick(WORK), tasks };
}
// One random step. Stopped agents go back to work, so the banner never fills up; busy agents
// move along their plans, and now and then one stops for you.
function simulate(list: Session[], now: number): Session[] {
  const top = list.filter((s) => !s.parentId);
  const busy = top.filter((s) => s.activity === 'working');
  const stopped = top.filter((s) => s.activity !== 'working');
  const change = (target: Session, patch: Partial<Session>) =>
    list.map((s) => (s.id === target.id ? { ...s, ...patch, updatedAt: now } : s));
  if (stopped.length > 1 || (stopped.length && Math.random() < 0.35)) {
    const s = pick(stopped);
    return change(s, { activity: 'working', detail: pick(WORK), tasks: restart(s.tasks) });
  }
  const s = pick(busy);
  if (!s) return list;
  return change(s, busy.length > 1 && Math.random() < 0.7 ? stop() : advance(s));
}

/* ---------------- Scenes: what the island shows in each part of the page ---------------- */

type SceneId =
  | 'hero'
  | 'states'
  | 'details'
  | 'details-glance'
  | 'details-details'
  | 'details-usage'
  | 'privacy'
  | 'install'
  | 'close';
interface Scene {
  // Scenes in one group keep their agents; only the view changes between them.
  group: string;
  build: Build;
  view?: View;
  paused?: boolean;
}
const SCENES: Record<SceneId, Scene> = {
  hero: { group: 'hero', build: (t) => SCENARIOS.several.build(t) },
  states: { group: 'states', build: STATES[0].build },
  details: { group: 'details', build: detailed },
  'details-glance': { group: 'details', build: detailed, view: 'glance' },
  'details-details': { group: 'details', build: detailed, view: 'details' },
  'details-usage': { group: 'details', build: detailed, view: 'usage' },
  privacy: { group: 'privacy', build: working, paused: true },
  install: { group: 'install', build: () => [] },
  close: { group: 'close', build: yourTurn },
};

const FACTS: { scene: SceneId; title: string; text: string }[] = [
  {
    scene: 'details-glance',
    title: 'Every agent at once',
    text: 'The one that needs you leads, with how full its context is. Claude Code limits and their reset times show when it reports them.',
  },
  {
    scene: 'details-details',
    title: 'Plans and tokens',
    text: 'The step each agent is on, its whole plan, and its tokens as the agent reports them.',
  },
  {
    scene: 'details-usage',
    title: 'Thirty days of history',
    text: 'Daily charts by agent and project, kept on this PC.',
  },
];

/* ---------------- Page parts ---------------- */

function StateTile({
  state,
  index,
  shown,
  onShow,
}: {
  state: State;
  index: number;
  shown: boolean;
  onShow: () => void;
}) {
  const view = notchView(groupSessions(state.build(T0), SEEN), SEEN, T0);
  const tone = state.paused || !view.current ? 'calm' : view.current.look.tone;
  return (
    <li className={`site-state site-item${shown ? ' is-shown' : ''}`} style={at(index)}>
      <div className="desk desk-compact" inert>
        <Fit width={400}>
          <div className="slot">
            <StaticIsland tone={tone} compact>
              <Compact view={view} paused={!!state.paused} now={T0} />
            </StaticIsland>
          </div>
        </Fit>
      </div>
      <p>
        <b>{state.title}</b>
        <span>{state.note}</span>
      </p>
      {/* A sibling, not a wrapper: the island inside has its own button. */}
      <button className="site-state-hit" aria-pressed={shown} onClick={onShow}>
        <span className="sr-only">Show {state.title} on the island</span>
      </button>
    </li>
  );
}

function Hello() {
  const [hello, setHello] = useState(false);
  useEffect(() => {
    if (!hello) return;
    const timer = setTimeout(() => setHello(false), 1200);
    return () => clearTimeout(timer);
  }, [hello]);
  return (
    <button
      className={`site-hello${hello ? ' is-hello' : ''}`}
      aria-label="Say hello to Glim"
      onClick={() => setHello(true)}
    >
      <Eyes mood={hello ? 'happy' : 'open'} tone="brand" size={176} follow />
      <span className="site-hello-text" aria-live="polite">
        {hello ? 'Hello.' : ''}
      </span>
    </button>
  );
}

function Facts({ step, onPick }: { step: number; onPick?: (i: number) => void }) {
  return (
    <dl className="site-facts">
      {FACTS.map((fact, i) => (
        <div
          key={fact.title}
          className={`site-item${onPick && step === i ? ' is-active' : ''}`}
          style={at(i + 1)}
        >
          <dt>{onPick ? <button onClick={() => onPick(i)}>{fact.title}</button> : fact.title}</dt>
          <dd>{fact.text}</dd>
        </div>
      ))}
    </dl>
  );
}

const SEVERAL = groupSessions(SCENARIOS.several.build(T0), SEEN);

function Site() {
  // Wide enough to open the island beside the copy without covering it.
  const wide = useMedia('(min-width: 1200px) and (min-height: 700px)');
  const [sessions, setSessions] = useState(() => SCENES.hero.build(T0));
  const [seenAt, setSeenAt] = useState(SEEN);
  const [view, setView] = useState<View>('compact');
  const [prefs, setPrefs] = useState<Preferences>(PREFS);
  const [connectors, setConnectors] = useState<Connector[]>(() =>
    structuredClone(previewConnectors),
  );
  const [scene, setScene] = useState<SceneId>('hero');
  const [shown, setShown] = useState<string | null>(null);
  // A visitor who clicks takes over the island until they scroll into the next part.
  const [pinned, setPinned] = useState(false);
  const manual = useRef(false);
  // After a Try it click, the hero's agents hold still for a while.
  const quietUntil = useRef(0);
  const group = useRef('hero');
  const [width, setWidth] = useState(() => window.innerWidth);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const resize = () => setWidth(window.innerWidth);
    const scroll = () => setScrolled(window.scrollY > 12);
    scroll();
    window.addEventListener('resize', resize);
    window.addEventListener('scroll', scroll, { passive: true });
    return () => {
      window.removeEventListener('resize', resize);
      window.removeEventListener('scroll', scroll);
    };
  }, []);

  const load = (build: Build, paused = false) => {
    const t = Date.now();
    setSessions(build(t));
    setSeenAt(t - 60_000);
    setPrefs((p) => ({ ...p, paused }));
  };
  const takeOver = () => {
    manual.current = true;
    setPinned(true);
  };

  // The part of the page crossing the middle of the window decides what the island shows.
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries)
          if (entry.isIntersecting)
            setScene((entry.target as HTMLElement).dataset.scene as SceneId);
      },
      { rootMargin: '-50% 0px -50% 0px' },
    );
    document.querySelectorAll('[data-scene]').forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [wide]);

  useEffect(() => {
    const next = SCENES[scene];
    if (next.group !== group.current) {
      group.current = next.group;
      manual.current = false;
      setPinned(false);
      setShown(null);
      load(next.build, !!next.paused);
    }
    if (!manual.current) setView(next.view ?? 'compact');
  }, [scene]);

  // In the states section the island walks the tiles in order, from Working, until a visitor
  // picks one. Coming back into the section starts the walk over.
  useEffect(() => {
    if (scene !== 'states' || pinned || !motionOk()) return;
    let i = 0;
    const step = () => {
      const state = STATES[i++ % STATES.length];
      setShown(state.title);
      load(state.build, !!state.paused);
    };
    step();
    const timer = setInterval(step, TOUR_MS);
    return () => clearInterval(timer);
  }, [scene, pinned]);

  // Left alone, the hero's agents keep working: random stops, plans moving, agents coming back.
  useEffect(() => {
    if (scene !== 'hero' || view !== 'compact' || !motionOk()) return;
    let timer = 0;
    const tick = () => {
      timer = window.setTimeout(() => {
        if (Date.now() >= quietUntil.current) setSessions((list) => simulate(list, Date.now()));
        tick();
      }, jitter(3800));
    };
    tick();
    return () => clearTimeout(timer);
  }, [scene, view]);

  // Each later section arrives once, as it scrolls into view.
  useEffect(() => {
    if (!document.documentElement.classList.contains('can-reveal')) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          (entry.target as HTMLElement).dataset.in = '';
          observer.unobserve(entry.target);
        }
      },
      { rootMargin: '0px 0px -12% 0px' },
    );
    document.querySelectorAll('.site-reveal:not([data-in])').forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [wide]);

  // Try it: the agent on the island reacts. A new event from another agent would wait for the
  // one being announced to finish, so the click acts on the one already showing.
  const canFire = !prefs.paused && sessions.some((s) => !s.parentId);
  const fire = (event: Partial<Session> | 'work') => {
    takeOver();
    quietUntil.current = Date.now() + 12_000;
    setShown(null);
    const now = Date.now();
    if (event === 'work') {
      setSessions((list) =>
        list.map((s) =>
          s.parentId || s.activity === 'working'
            ? s
            : {
                ...s,
                activity: 'working' as const,
                detail: pick(WORK),
                tasks: restart(s.tasks),
                updatedAt: now,
              },
        ),
      );
      return;
    }
    const onIsland =
      document.querySelector<HTMLElement>('.site-island .compact')?.dataset.sessionId;
    const top = sessions.filter((s) => !s.parentId);
    const target =
      top.find((s) => s.id === onIsland) ??
      top.filter((s) => s.activity === 'working').at(-1) ??
      top[0];
    if (!target) return;
    setSessions((list) =>
      list.map((s) => (s.id === target.id ? { ...s, ...event, updatedAt: now } : s)),
    );
  };
  const show = (state: State) => {
    takeOver();
    setShown(state.title);
    setView('compact');
    load(state.build, !!state.paused);
  };
  const step = scene === 'details-details' ? 1 : scene === 'details-usage' ? 2 : 0;
  const pickFact = (i: number) => {
    manual.current = false;
    setView(SCENES[FACTS[i].scene].view ?? 'glance');
    document.querySelector(`[data-scene="${FACTS[i].scene}"]`)?.scrollIntoView({ block: 'center' });
  };

  return (
    <div className="site" id="top">
      <div className="site-edge" aria-hidden="true" />
      <div className="site-island">
        <LiveIsland
          sessions={sessions}
          seenAt={seenAt}
          onSeen={setSeenAt}
          view={view}
          onView={(next) => {
            takeOver();
            setView(next);
          }}
          prefs={prefs}
          onPrefs={setPrefs}
          connectors={connectors}
          onConnectors={setConnectors}
          maxWidth={width - 40}
        />
      </div>

      <header className={`site-top${scrolled ? ' is-scrolled' : ''}`}>
        <a className="site-pill site-brand" href="#top">
          <Eyes mood="open" tone="brand" size={30} follow label="Glim" />
          <span aria-hidden="true">Glim</span>
        </a>
        <nav className="site-pill site-nav" aria-label="Glim">
          <a className="site-link" href={REPO} aria-label="GitHub">
            <Github size={18} aria-hidden="true" />
            <span>GitHub</span>
          </a>
          <a className="site-button site-button-small" href={DOWNLOAD}>
            <Download size={16} strokeWidth={2.4} aria-hidden="true" />
            Download
          </a>
        </nav>
      </header>

      <main>
        <section className="site-hero" data-scene="hero" aria-labelledby="site-title">
          <h1 id="site-title" style={at(0)}>
            A glimpse at your agents. <span>Then back to your flow.</span>
          </h1>
          <p className="site-sub" style={at(1)}>
            Glim sits at the top of your screen and shows what Claude Code and Codex are doing, so
            you can stay in your own work.
          </p>
          <div className="site-cta" style={at(2)}>
            <a className="site-button" href={DOWNLOAD}>
              <Download size={19} strokeWidth={2.4} aria-hidden="true" />
              Download for Windows
            </a>
            <a className="site-more" href={REPO}>
              View on GitHub <ArrowUpRight size={17} aria-hidden="true" />
            </a>
          </div>
          <p className="site-meta" style={at(3)}>
            Windows 11 · Free and open source · No account
          </p>
          <div className="site-try" style={at(4)} data-keep-open>
            <span id="site-try">Try it on the island above</span>
            <div className="pseg" role="group" aria-labelledby="site-try">
              <button
                disabled={!canFire}
                onClick={() => fire({ activity: 'waiting', detail: 'Waiting for approval' })}
              >
                Ask for approval
              </button>
              <button
                disabled={!canFire}
                onClick={() => fire({ activity: 'idle', detail: 'Turn finished' })}
              >
                Finish a turn
              </button>
              <button
                disabled={!canFire}
                onClick={() => fire({ activity: 'error', detail: 'Agent reported an error' })}
              >
                Hit an error
              </button>
              <button onClick={() => fire('work')}>Back to work</button>
            </div>
            <p>
              The agent on the island reacts. Click the island to open it. It runs on sample
              sessions.
            </p>
          </div>
        </section>

        <section
          className="site-section site-reveal"
          data-scene="states"
          aria-labelledby="states-title"
        >
          <h2 id="states-title">Every state has its own color.</h2>
          <p className="site-lede">
            Look up, see which agent needs you, look back down. Pick one to put it on the island.
          </p>
          <ul className="site-states" data-keep-open>
            {STATES.map((state, i) => (
              <StateTile
                key={state.title}
                state={state}
                index={i}
                shown={shown === state.title}
                onShow={() => show(state)}
              />
            ))}
          </ul>
        </section>

        {wide ? (
          // The island opens itself here and changes view as the visitor scrolls.
          <section className="site-scrolly site-reveal" aria-labelledby="details-title">
            <div className="site-scrolly-stage" data-keep-open>
              <div className="site-scrolly-copy">
                <h2 id="details-title">Open it for the details.</h2>
                <p className="site-lede">
                  One click shows every agent at once. Scroll, and the island above walks through
                  what is inside.
                </p>
              </div>
              <Facts step={step} onPick={pickFact} />
            </div>
            {FACTS.map((fact, i) => (
              <div
                key={fact.scene}
                className="site-scrolly-step"
                style={at(i)}
                data-scene={fact.scene}
                aria-hidden="true"
              />
            ))}
          </section>
        ) : (
          <section
            className="site-section site-split site-reveal"
            data-scene="details"
            aria-labelledby="details-title"
          >
            <div>
              <h2 id="details-title">Open it for the details.</h2>
              <p className="site-lede">
                One click shows every agent at once, with the one that needs you first.
              </p>
              <Facts step={step} />
            </div>
            <div className="site-item" style={at(2)}>
              <Fit width={480}>
                <div className="desk desk-view site-art" inert>
                  <StaticIsland width={440}>
                    <Glance groups={SEVERAL} focusId="demo-claude" now={T0} paused={false} />
                  </StaticIsland>
                </div>
              </Fit>
            </div>
          </section>
        )}

        <section
          className="site-section site-reveal"
          data-scene="privacy"
          aria-labelledby="privacy-title"
        >
          <h2 id="privacy-title" className="site-display">
            Stays on your PC.
          </h2>
          <ul className="site-points">
            <li className="site-item" style={at(0)}>
              <b>No account, no cloud.</b>
              No sign-in and no API key. No telemetry and no sync.
            </li>
            <li className="site-item" style={at(1)}>
              <b>No prompts kept.</b>
              Glim never stores prompts, responses, tool output or credentials. It keeps counters,
              names and task labels for 30 days.
            </li>
            <li className="site-item" style={at(2)}>
              <b>Every change shown.</b>
              Connecting shows each entry Glim adds to your agent’s settings and keeps a backup.
              Disconnecting removes only Glim’s entries.
            </li>
            <li className="site-item" style={at(3)}>
              <b>Pause anytime.</b>
              One switch in the tray or in settings stops collection until you turn it back on.
            </li>
          </ul>
        </section>

        <section
          className="site-section site-reveal"
          id="install"
          data-scene="install"
          aria-labelledby="install-title"
        >
          <h2 id="install-title">Three steps, then back to work.</h2>
          <ol className="site-steps">
            <li className="site-item" style={at(0)}>
              <b>Download</b>
              <span>Get the installer from GitHub Releases. Windows 11, 64-bit.</span>
            </li>
            <li className="site-item" style={at(1)}>
              <b>Install</b>
              <span>
                It installs for your account only, so no administrator rights. If Windows warns
                about a new app, choose More info, then Run anyway.
              </span>
            </li>
            <li className="site-item" style={at(2)}>
              <b>Connect</b>
              <span>
                Pick Claude Code, Codex or both. Glim shows what it will add before it adds it. For
                Codex, then trust the Glim hooks in <code>/hooks</code>.
              </span>
            </li>
          </ol>
          <div className="site-works site-item" style={at(3)}>
            <span className="site-agent">
              <img src={`${ASSETS}providers/claude.svg`} width={26} height={26} alt="" />
              Claude Code
            </span>
            <span className="site-agent">
              <i className="site-codex" aria-hidden="true" />
              Codex CLI
            </span>
            <p>
              In native Windows terminals, including the one in your IDE. WSL and remote sessions
              are not supported yet.
            </p>
          </div>
        </section>

        <section
          className="site-close site-reveal"
          data-scene="close"
          aria-labelledby="close-title"
        >
          <Hello />
          <h2 id="close-title">Glim is ready when you are.</h2>
          <div className="site-close-cta site-item" style={at(1)}>
            <a className="site-button" href={DOWNLOAD}>
              <Download size={19} strokeWidth={2.4} aria-hidden="true" />
              Download for Windows
            </a>
          </div>
          <p className="site-meta">Free and open source under the MIT license.</p>
        </section>
      </main>

      <footer className="site-foot">
        <a className="site-brand site-brand-small" href="#top">
          <Eyes mood="open" tone="brand" size={22} follow label="Glim" />
          <span aria-hidden="true">Glim</span>
        </a>
        <nav aria-label="Project">
          <a href={REPO}>GitHub</a>
          <a href={`${REPO}/releases`}>Releases</a>
          <a href={`${REPO}/blob/main/docs/compatibility.md`}>Compatibility</a>
          <a href={`${REPO}#privacy`}>Privacy</a>
          <a href={`${REPO}/blob/main/LICENSE`}>License</a>
        </nav>
        <p>
          Glim is an independent open-source project. Claude Code is made by Anthropic and Codex by
          OpenAI; neither is affiliated with Glim.
        </p>
      </footer>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Site />
  </StrictMode>,
);
