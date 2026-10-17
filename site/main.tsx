// Glim's website. It has its own dev server (npm run site, port 3000) and build (npm run
// site:build); the desktop app never loads it. The island at the top is the real redesigned
// component from ../preview-claude, running on sample sessions. This file only drives it through
// its props; nothing in ../preview-claude or ../src changes for the website.
import {
  memo,
  StrictMode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type RefObject,
} from 'react';
import { createRoot } from 'react-dom/client';
import { ArrowUpRight, Check, Cloud, Download, Monitor, X } from 'lucide-react';
import '@fontsource-variable/manrope';
import '@fontsource-variable/unbounded';
import '../preview-claude/style.css';
// The app's own stylesheet after the reference one, so every island on the page looks as it does
// in the app; the website's styles come last.
import '../src/styles.css';
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
  Connectors,
  sample,
  SCENARIOS,
  StaticIsland,
  Switch,
  T0,
} from '../preview-claude/island';
// The notch and its views are the app's own components.
import { Compact, Glance } from '../src/island-views';
import { groupSessions, notchView } from '../src/session-presentation';
import { AppIsland, type IslandView as View } from './AppIsland';
import { GlimDrawing } from '../preview-claude/brand';
import { Glim3D, Glim3DInPlace, type Mood as GlimMood, type Tone as GlimTone } from './Glim3D';
import FaultyTerminal from './react-bits/FaultyTerminal';
import GradualBlur from './react-bits/GradualBlur';
import {
  Brand,
  DownloadLink,
  GetLinks,
  NEEDS,
  OTHER,
  PageLinks,
  REPO,
  SiteFoot,
  SYSTEM,
  SystemSwitch,
  type System,
} from './chrome';

// Public files, relative to wherever the site is served from.
const ASSETS = import.meta.env.BASE_URL;
const SEEN = T0 - 60_000;
// The site's island has quick options on, so a visitor can find them on hover.
const PREFS: Preferences = {
  ...DEFAULT_PREFERENCES,
  onboardingComplete: true,
  quickOptionsEnabled: true,
  quickOptions: ['centre', 'pause', 'settings', 'usage'],
};
const motionOk = () => !window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// A refresh starts at the top, not where the page was left; a link to a section still goes there.
history.scrollRestoration = 'manual';
const navigation = performance.getEntriesByType('navigation')[0] as
  PerformanceNavigationTiming | undefined;
if (navigation?.type === 'reload') {
  if (location.hash) history.replaceState(null, '', location.pathname + location.search);
  window.scrollTo({ top: 0, behavior: 'instant' });
}

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

// On the website, the sample agents are building the website itself: their projects are its parts,
// glim-website's plan is its sections, and what they are doing follows the part being read. The
// app's own sample data stays as it is; this only retells it.
const PROJECTS: Record<string, string> = {
  'glim-desktop': 'glim-website',
  'api-service': 'glim-3d',
  'design-system': 'site-copy',
  // A second agent in the website's own folder, so the island shows one project with two.
  'docs-site': 'glim-website',
};
// What each sample agent says when it hands the turn over, asks, or wants to run.
const SAID: Record<string, string> = {
  'demo-claude':
    'The hero is drawn: the island light, the headline and a row of Glims.\n\nWant me to color the state cards next?',
  'demo-claude-2':
    'I tightened the state notes so each one fits on two lines. Should the privacy section get the same pass?',
  'demo-codex': 'Bash: npm run render -- --glims 12',
  'demo-docs': 'Bash: npm run site:build',
};
const PLAN = [
  'Draw the hero',
  'Color the state cards',
  'Open the island views',
  'Animate the privacy cards',
  'Write the install steps',
  'Ship the website',
];
// Where the plan stands in each part of the page.
const STEP_OF: Record<string, number> = {
  hero: 0,
  states: 1,
  details: 2,
  privacy: 3,
  install: 4,
  close: 5,
};
// What a working agent is doing, by part of the page.
const WORK_OF: Record<string, string[]> = {
  hero: ['Placing the Glims', 'Tuning the island light', 'Writing the headline'],
  states: ['Matching state colors', 'Drawing the state cards', 'Lighting the desks'],
  details: ['Opening the island', 'Charting thirty days', 'Listing the plan'],
  privacy: ['Wiring the local pipe', 'Checking what stays local', 'Sorting what is kept'],
  install: ['Writing the install steps', 'Linking the releases'],
  close: ['Getting the download ready', 'Polishing the last panel', 'Waking the Glims'],
};
const SUBWORK: Record<string, string> = {
  'Exploring files': 'Checking the phone layout',
  'Running a command': 'Running the site build',
};
const GENERIC = new Set([
  'Thinking',
  'Editing files',
  'Running a command',
  'Reading files',
  'Exploring files',
]);
const workOf = (group: string) => WORK_OF[group] ?? WORK_OF.hero;
function onSite(list: Session[], group: string): Session[] {
  const step = STEP_OF[group] ?? 0;
  const work = workOf(group);
  return list.map((s, i) => {
    const done = s.tasks.length > 0 && s.tasks.every((task) => task.status === 'completed');
    const tasks: Task[] = s.tasks.length
      ? PLAN.map((label, j) => ({
          id: String(j + 1),
          label,
          status: done || j < step ? 'completed' : j === step ? 'in_progress' : 'pending',
        }))
      : s.tasks;
    const detail = s.parentId
      ? (SUBWORK[s.detail] ?? s.detail)
      : s.activity === 'working' && GENERIC.has(s.detail)
        ? work[i % work.length]
        : s.detail;
    return {
      ...s,
      project: PROJECTS[s.project] ?? s.project,
      tasks,
      detail,
      message: SAID[s.id] ?? s.message,
      // Each agent has a terminal to go back to; on the website, going there closes the island.
      process: s.parentId ? undefined : ([0, 0] as [number, number]),
    };
  });
}

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

// Several agents in different states: two take turns working, and what needs you waits below:
// an approval, a handed-back turn and an error.
const mixed: Build = (t) => [
  ...SCENARIOS.several
    .build(t)
    .map((s) =>
      s.id === 'demo-claude-2'
        ? { ...s, activity: 'idle' as const, detail: 'Turn finished', updatedAt: t - 40_000 }
        : s,
    ),
  sample('demo-codex', t, {
    id: 'demo-release',
    project: 'release-notes',
    activity: 'error',
    detail: 'Agent reported an error',
    updatedAt: t - 70_000,
  }),
];

interface State {
  title: string;
  // How the 3D Glim shows it.
  tone: GlimTone;
  mood: GlimMood;
  note: string;
  build: Build;
  paused?: boolean;
  // The card wears every state's color at once instead of its tone.
  spectrum?: boolean;
}
const STATES: State[] = [
  {
    title: 'Working',
    tone: 'active',
    mood: 'scan',
    note: 'Blue. Its eyes glance side to side while it works.',
    build: working,
  },
  {
    title: 'Needs approval',
    tone: 'attention',
    mood: 'wide',
    note: 'Amber, and the island glows. It counts how long it has waited.',
    build: (t) => [sample('demo-codex', t, { updatedAt: t - 128_000 })],
  },
  {
    title: 'Your turn',
    tone: 'success',
    mood: 'happy',
    note: 'Teal when an agent hands the turn back to you.',
    build: yourTurn,
  },
  {
    title: 'Error',
    tone: 'error',
    mood: 'cross',
    note: 'Red, with crossed eyes, until the agent moves on.',
    build: (t) => [
      sample('demo-claude', t, {
        activity: 'error',
        detail: 'Agent reported an error',
        updatedAt: t - 14_000,
      }),
    ],
  },
  {
    title: 'Limit reached',
    tone: 'limit',
    mood: 'half',
    note: 'Violet when a usage limit stops the agent. It stays until the agent works again.',
    build: (t) => [
      sample('demo-claude', t, {
        activity: 'limited',
        detail: 'Usage limit reached',
        updatedAt: t - 22_000,
      }),
    ],
  },
  {
    title: 'Interrupted',
    tone: 'calm',
    mood: 'half',
    note: 'Grey and half asleep. You stopped it, so there is nothing to chase.',
    build: (t) => [
      sample('demo-claude', t, {
        activity: 'interrupted',
        detail: 'Turn interrupted',
        updatedAt: t - 30_000,
      }),
    ],
  },
  {
    title: 'Done',
    tone: 'done',
    mood: 'happy',
    note: 'Green. The session ended and nothing waits on you.',
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
    title: 'Paused',
    tone: 'calm',
    mood: 'closed',
    note: 'Closed eyes until you resume monitoring.',
    build: working,
    paused: true,
  },
  {
    title: 'Several agents',
    tone: 'brand',
    mood: 'scan',
    spectrum: true,
    note: 'Working agents take turns, one dot each. What needs you folds into a strip of dots below.',
    build: mixed,
  },
];
const TOUR_MS = 4000;
const pick = <T,>(list: T[]) => list[Math.floor(Math.random() * list.length)];

/* ---------------- The hero's agent, left to itself ---------------- */

// A finished plan starts over when its agent goes back to work.
function restart(tasks: Task[]): Task[] {
  if (!tasks.length || tasks.some((t) => t.status !== 'completed')) return tasks;
  return tasks.map((t, i) => ({ ...t, status: i ? 'pending' : 'in_progress' }));
}
// A whole turn, from ready to done, then over again: how long each step holds, and what the
// agent reports. `work` is a task from the part of the page being read.
const FLOW: [number, Partial<Session> | 'work'][] = [
  [2600, { activity: 'idle', detail: 'Ready for your next idea' }],
  [2600, { activity: 'working', detail: 'Thinking' }],
  [3600, 'work'],
  [4400, { activity: 'waiting', detail: 'Waiting for approval' }],
  [3600, 'work'],
  [4400, { activity: 'idle', detail: 'Turn finished' }],
  [3600, 'work'],
  [4000, { activity: 'error', detail: 'Agent reported an error' }],
  [3600, 'work'],
  [4000, { activity: 'limited', detail: 'Usage limit reached' }],
  [3600, 'work'],
  [3600, { activity: 'interrupted', detail: 'Turn interrupted' }],
  [3600, 'work'],
  [4800, { activity: 'finished', detail: 'Session ended' }],
];
const ready: Build = (t) => [
  sample('demo-claude', t, { activity: 'idle', detail: 'Ready for your next idea' }),
];

/* ---------------- Scenes: what the island shows in each part of the page ---------------- */

type SceneId =
  | 'hero'
  | 'states'
  | 'details'
  | 'details-glance'
  | 'details-details'
  | 'details-usage'
  | 'details-settings'
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
  hero: { group: 'hero', build: ready },
  states: { group: 'states', build: STATES[0].build },
  details: { group: 'details', build: detailed },
  'details-glance': { group: 'details', build: detailed, view: 'glance' },
  'details-details': { group: 'details', build: detailed, view: 'details' },
  'details-usage': { group: 'details', build: detailed, view: 'usage' },
  'details-settings': { group: 'details', build: detailed, view: 'settings' },
  privacy: { group: 'privacy', build: working },
  install: { group: 'install', build: () => [] },
  // A turn on a loop, as in the hero, so the notch keeps changing and the hello Glim with it.
  close: { group: 'close', build: ready },
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
    text: 'Daily charts by agent and project, kept on this computer.',
  },
  {
    scene: 'details-settings',
    title: 'Yours to place',
    text: 'Hold the island to slide it along the top of the screen. Quick options are a hover away, and the glow goes from off to bright.',
  },
];

const SPILL: Record<string, string> = {
  active: '#5cc8ff',
  attention: '#ffc53d',
  success: '#36d4c4',
  error: '#ff6a5f',
  limit: '#a78bfa',
  done: '#3ddc84',
  calm: '#a5b4fc',
  off: '#a5b4fc',
};
const MOOD_OF: Record<string, GlimMood> = {
  active: 'scan',
  attention: 'wide',
  success: 'happy',
  error: 'cross',
  limit: 'half',
  done: 'happy',
  calm: 'open',
  off: 'closed',
};
// The tone of what the island is showing, read from the island itself.
function useIslandTone() {
  const [tone, setTone] = useState('active');
  useEffect(() => {
    const shell = document.querySelector('.site-island .shell');
    if (!shell) return;
    const sync = () => setTone(shell.getAttribute('data-tone') ?? 'calm');
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(shell, { attributes: true, attributeFilter: ['data-tone'] });
    return () => observer.disconnect();
  }, []);
  return tone;
}

// Behind the call-to-action panel, Glims wait along its sides; hovering Download brings them out.
// Each has its own size (a share of the room beside the panel), how far it leans out, and tilt.
const CHEER: {
  side: 'left' | 'right';
  at: number;
  scale: number;
  out: number;
  tilt: number;
  tone: GlimTone;
  mood: GlimMood;
}[] = [
  { side: 'left', at: 19, scale: 1.5, out: 80, tilt: -14, tone: 'calm', mood: 'open' },
  { side: 'left', at: 52, scale: 1.8, out: 84, tilt: -7, tone: 'attention', mood: 'wide' },
  { side: 'left', at: 84, scale: 1.45, out: 78, tilt: -18, tone: 'done', mood: 'happy' },
  { side: 'right', at: 17, scale: 1.7, out: 82, tilt: 10, tone: 'brand', mood: 'happy' },
  { side: 'right', at: 49, scale: 1.4, out: 78, tilt: 17, tone: 'error', mood: 'wide' },
  { side: 'right', at: 82, scale: 1.75, out: 83, tilt: 8, tone: 'active', mood: 'open' },
];

// The terminal behind the hero fades to black near the words: its mask has a soft hole around each
// of them, redrawn whenever the words or the hero change size.
function useClearing() {
  const words = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const copy = words.current;
    const hero = copy?.parentElement;
    if (!copy || !hero) return;
    const blur = 44;
    const pad = blur * 1.5;
    const sync = () => {
      const holes = [...copy.children].map((child) => {
        const el = child as HTMLElement;
        const x = copy.offsetLeft + el.offsetLeft - pad;
        const y = copy.offsetTop + el.offsetTop - pad;
        return `<rect x="${x}" y="${y}" width="${el.offsetWidth + pad * 2}" height="${el.offsetHeight + pad * 2}" rx="${pad}"/>`;
      });
      const w = hero.offsetWidth;
      const h = hero.offsetHeight;
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><filter id="b" filterUnits="userSpaceOnUse" x="0" y="0" width="${w}" height="${h}"><feGaussianBlur stdDeviation="${blur}"/></filter><rect width="${w}" height="${h}" fill="#fff"/><g filter="url(#b)">${holes.join('')}</g></svg>`;
      hero.style.setProperty('--clearing', `url("data:image/svg+xml,${encodeURIComponent(svg)}")`);
    };
    sync();
    const observer = new ResizeObserver(sync);
    observer.observe(copy);
    observer.observe(hero);
    return () => observer.disconnect();
  }, []);
  return words;
}

// The hero's cast: a row of Glims peeking over the horizon, each turning to look at the pointer.
// Two loose piles of Glims fill the bottom corners; the middle stays clear for the words, with
// only the indigo Glim peeking up, in front. Sizes and heights are shares of the window's width.
interface Peek {
  tone: GlimTone;
  mood: GlimMood;
  share: number;
  // Center, as a percentage of the width.
  x: number;
  // How far above the base line it stands.
  lift: number;
  tilt: number;
  // Stacking: higher is closer.
  depth: number;
}
const CROWD: Peek[] = [
  { tone: 'done', mood: 'open', share: 0.105, x: 8, lift: 0.085, tilt: 10, depth: 1 },
  { tone: 'calm', mood: 'open', share: 0.11, x: 23, lift: 0.06, tilt: -6, depth: 1 },
  { tone: 'success', mood: 'happy', share: 0.16, x: 3, lift: 0, tilt: -8, depth: 4 },
  { tone: 'active', mood: 'open', share: 0.19, x: 14, lift: -0.01, tilt: 5, depth: 5 },
  { tone: 'attention', mood: 'wide', share: 0.14, x: 27, lift: 0.005, tilt: 8, depth: 3 },
  { tone: 'error', mood: 'open', share: 0.1, x: 35, lift: -0.012, tilt: -10, depth: 2 },
  { tone: 'active', mood: 'open', share: 0.105, x: 92, lift: 0.09, tilt: -9, depth: 1 },
  { tone: 'success', mood: 'open', share: 0.11, x: 77, lift: 0.055, tilt: 7, depth: 1 },
  { tone: 'error', mood: 'open', share: 0.16, x: 97, lift: 0, tilt: 8, depth: 4 },
  { tone: 'done', mood: 'happy', share: 0.19, x: 86, lift: -0.01, tilt: -5, depth: 5 },
  { tone: 'calm', mood: 'open', share: 0.14, x: 73, lift: 0.005, tilt: -8, depth: 3 },
  { tone: 'attention', mood: 'open', share: 0.1, x: 65, lift: -0.012, tilt: 10, depth: 2 },
  { tone: 'brand', mood: 'open', share: 0.15, x: 50, lift: 0, tilt: 0, depth: 9 },
];
const PHONE_CROWD: Peek[] = [
  { tone: 'calm', mood: 'open', share: 0.2, x: 5, lift: 0.16, tilt: 10, depth: 1 },
  { tone: 'success', mood: 'happy', share: 0.3, x: 7, lift: 0, tilt: -8, depth: 4 },
  { tone: 'active', mood: 'open', share: 0.25, x: 25, lift: 0.05, tilt: 6, depth: 2 },
  { tone: 'error', mood: 'open', share: 0.2, x: 95, lift: 0.16, tilt: -10, depth: 1 },
  { tone: 'done', mood: 'open', share: 0.3, x: 93, lift: 0, tilt: 8, depth: 4 },
  { tone: 'attention', mood: 'wide', share: 0.25, x: 75, lift: 0.05, tilt: -6, depth: 2 },
  { tone: 'brand', mood: 'open', share: 0.32, x: 50, lift: -0.02, tilt: 0, depth: 9 },
];

/* ---------------- Page parts ---------------- */

// Memoized: the page re-renders whenever the island changes, and eight islands are a lot to redo.
const StateCard = memo(function StateCard({
  state,
  index,
  shown,
  onShow,
}: {
  state: State;
  index: number;
  shown: boolean;
  onShow: (state: State) => void;
}) {
  const groups = groupSessions(onSite(state.build(T0), 'states'), SEEN);
  const view = notchView(groups, SEEN, T0);
  const tone = state.paused || !view.current ? 'calm' : view.current.look.tone;
  return (
    <li
      className={`site-card site-item${shown ? ' is-shown' : ''}`}
      style={at(index)}
      data-tone={state.spectrum ? 'spectrum' : state.tone}
    >
      <div className="desk desk-compact" inert>
        <Fit width={400}>
          <div className="slot">
            <StaticIsland tone={tone} compact>
              <Compact
                view={view}
                count={groups.length}
                folded={false}
                onFoldedChange={() => {}}
                paused={!!state.paused}
                now={T0}
              />
            </StaticIsland>
          </div>
        </Fit>
      </div>
      <p>
        <b>
          <i aria-hidden="true" />
          {state.title}
        </b>
        <span>{state.note}</span>
      </p>
      {/* A sibling, not a wrapper: the island inside has its own button. */}
      <button className="site-card-hit" aria-pressed={shown} onClick={() => onShow(state)}>
        <span className="sr-only">Show {state.title} on the island</span>
      </button>
    </li>
  );
});

// Counts up while `ref` is well on screen, one step every `ms`, starting a moment after it
// arrives so the card's own entrance plays first. Stays at -1 under reduced motion, so the scenes
// below hold still.
function useLoop(ref: RefObject<HTMLElement | null>, ms: number) {
  const [step, setStep] = useState(-1);
  useEffect(() => {
    const el = ref.current;
    if (!el || !motionOk()) return;
    let timer = 0;
    let start = 0;
    const observer = new IntersectionObserver(
      ([entry]) => {
        clearTimeout(start);
        clearInterval(timer);
        if (!entry.isIntersecting) return;
        start = window.setTimeout(() => {
          setStep((n) => n + 1);
          timer = window.setInterval(() => setStep((n) => n + 1), ms);
        }, 900);
      },
      { threshold: 0.5 },
    );
    observer.observe(el);
    return () => {
      observer.disconnect();
      clearTimeout(start);
      clearInterval(timer);
    };
  }, [ref, ms]);
  return step;
}

function AgentLogo({ provider, size }: { provider: 'claude' | 'codex'; size: number }) {
  return provider === 'claude' ? (
    <img src={`${ASSETS}providers/claude.svg`} width={size} height={size} alt="" />
  ) : (
    <span className="gl">
      <span className="logo logo-codex" style={{ width: size, height: size }} />
    </span>
  );
}

// What the agents tell Glim, in turn. Each travels the pipe; Glim takes on its state on arrival.
const PIPE = [
  { from: 'claude', tone: 'active', mood: 'scan', text: 'Editing files' },
  { from: 'codex', tone: 'attention', mood: 'wide', text: 'Needs approval' },
  { from: 'claude', tone: 'success', mood: 'happy', text: 'Your turn' },
  { from: 'codex', tone: 'error', mood: 'cross', text: 'Error' },
  { from: 'claude', tone: 'calm', mood: 'half', text: 'Interrupted' },
  { from: 'codex', tone: 'done', mood: 'happy', text: 'Done' },
] as const;

// Both agents report to Glim through a private channel inside this computer. Each event goes on
// from Glim towards the cloud and is stopped at its edge; then the other agent speaks.
function LocalPipe() {
  const box = useRef<HTMLDivElement>(null);
  const step = useLoop(box, 3400);
  const [got, setGot] = useState(-1);
  useEffect(() => {
    if (step < 0) return;
    const timer = setTimeout(() => setGot(step), 950);
    return () => clearTimeout(timer);
  }, [step]);
  const sent = step >= 0 ? PIPE[step % PIPE.length] : null;
  const shown = got >= 0 ? PIPE[got % PIPE.length] : null;
  return (
    <div className="site-pipe-card" aria-hidden="true">
      <div className="site-pipe" ref={box}>
        <div className="site-pipe-pc">
          <span className="site-pipe-tag">
            <Monitor size={13} strokeWidth={2.2} />
            This computer
          </span>
          {(['claude', 'codex'] as const).map((provider, i) => (
            <span
              key={provider}
              className={`site-pipe-agent is-${provider}`}
              style={{ top: i ? 132 : 58 }}
            >
              <AgentLogo provider={provider} size={20} />
              {provider === 'claude' ? 'Claude Code' : 'Codex'}
              {sent?.from === provider && (
                <i key={step} className="site-pipe-ping" data-tone={sent.tone} />
              )}
            </span>
          ))}
          <svg className="site-pipe-wires" width="400" height="230" viewBox="0 0 400 230">
            <path d="M178 78 C 236 78, 236 116, 286 116" />
            <path d="M178 152 C 236 152, 236 116, 286 116" />
            {/* Out of Glim to the cut, and on to the cloud it never reaches. */}
            <path className="site-pipe-out" d="M374 116 H 429" />
            <path className="site-pipe-out" d="M451 116 H 491" />
          </svg>
          {sent && (
            <span
              key={`packet${step}`}
              className={`site-pipe-packet from-${sent.from}`}
              data-tone={sent.tone}
            />
          )}
          <span className="site-pipe-glim">
            <Glim3D
              tone={shown?.tone ?? 'brand'}
              mood={shown?.mood ?? 'open'}
              size={92}
              hop={got + 1}
            />
          </span>
          {shown && (
            <span key={`caption${got}`} className="site-pipe-caption" data-tone={shown.tone}>
              <AgentLogo provider={shown.from} size={14} />
              {shown.text}
            </span>
          )}
          <span className="site-pipe-note">A private channel only your account can open</span>
        </div>
        {got >= 0 && (
          <>
            <span key={`leak${got}`} className="site-pipe-leak" data-tone={shown?.tone} />
            <span key={`stop${got}`} className="site-pipe-stop" />
          </>
        )}
        <span className="site-pipe-cut">
          <X size={12} strokeWidth={3} />
        </span>
        <span className="site-pipe-cloud">
          <Cloud size={30} strokeWidth={1.6} />
          No cloud
        </span>
      </div>
    </div>
  );
}

const KEPT = ['Token counts', 'Usage by day', 'Project names', 'Task labels'];
const NEVER = ['Prompts', 'Responses', 'Tool output', 'Credentials'];
// What arrives, as it would look, and the row it belongs to: kept ones join their row, the
// others are struck out and dissolve at theirs.
const SORT = [
  { row: 'Prompts', sample: '“Fix the login bug”' },
  { row: 'Token counts', sample: '12.4k tokens' },
  { row: 'Responses', sample: '“Done. I updated…”' },
  { row: 'Usage by day', sample: 'Thu · 84k tokens' },
  { row: 'Tool output', sample: '$ npm test' },
  { row: 'Project names', sample: 'glim-desktop' },
  { row: 'Credentials', sample: 'sk-••••••••' },
  { row: 'Task labels', sample: 'Polish the island' },
];
function Kept() {
  const box = useRef<HTMLDivElement>(null);
  const step = useLoop(box, 2300);
  const item = step >= 0 ? SORT[step % SORT.length] : null;
  // Where the current sample is: dropped to the middle, then at its row. Tagged with its step, so
  // a new sample never starts from where the last one went; \`instant\` places it without moving.
  const [to, setTo] = useState<{ step: number; x: number; y: number; instant?: boolean } | null>(
    null,
  );
  const [hit, setHit] = useState<string | null>(null);
  useLayoutEffect(() => {
    const list = box.current;
    const row = item && list?.querySelector<HTMLElement>(`[data-row="${item.row}"]`);
    if (!item || !list || !row) return;
    // Layout positions, not painted ones, summed up to the list: while a box plays its arrival
    // animation it becomes the row's offset parent, and the row's own offsets are then relative
    // to the box.
    let x = row.offsetWidth / 2;
    let y = row.offsetHeight / 2;
    for (let el: HTMLElement | null = row; el && el !== list; el = el.offsetParent as HTMLElement) {
      x += el.offsetLeft;
      y += el.offsetTop;
    }
    const target = { step, x, y };
    const middle = { step, x: list.offsetWidth / 2, y: list.offsetHeight / 2 };
    // With the two lists stacked (phones), the sample comes in from the middle of the left edge,
    // passes the center, and goes on to its row.
    const [kept, never] = list.children as unknown as HTMLElement[];
    if (kept.offsetTop !== never.offsetTop) {
      setTo({ step, x: 0, y: middle.y, instant: true });
      const center = setTimeout(() => setTo(middle), 200);
      const move = setTimeout(() => setTo(target), 720);
      const land = setTimeout(() => setHit(item.row), 1300);
      return () => {
        clearTimeout(center);
        clearTimeout(move);
        clearTimeout(land);
      };
    }
    const frame = requestAnimationFrame(() => setTo(middle));
    const move = setTimeout(() => setTo(target), 650);
    const land = setTimeout(() => setHit(item.row), 1300);
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(move);
      clearTimeout(land);
    };
  }, [step]);
  const row = (name: string, never: boolean, j: number) => (
    <li
      key={name}
      data-row={name}
      className={hit === name ? 'is-hit' : undefined}
      style={{ '--j': j } as CSSProperties}
    >
      {never ? (
        <X size={14} strokeWidth={2.6} aria-hidden="true" />
      ) : (
        <Check size={14} strokeWidth={2.6} aria-hidden="true" />
      )}
      {never ? <s>{name}</s> : name}
    </li>
  );
  return (
    <div className="site-kept" ref={box}>
      <div>
        <span>Kept 30 days, on this computer</span>
        <ul>{KEPT.map((name, i) => row(name, false, i))}</ul>
      </div>
      <div className="is-never">
        <span>Never kept</span>
        <ul>{NEVER.map((name, i) => row(name, true, i + 4))}</ul>
      </div>
      {item && (
        <span
          key={step}
          className={`site-sort-chip${KEPT.includes(item.row) ? '' : ' is-never'}`}
          style={
            to?.step === step
              ? { left: to.x, top: to.y, transition: to.instant ? 'none' : undefined }
              : undefined
          }
          aria-hidden="true"
        >
          {item.sample}
        </span>
      )}
    </div>
  );
}

function Hello({
  size,
  tone = 'brand',
  mood = 'open',
}: {
  size: number;
  tone?: GlimTone;
  mood?: GlimMood;
}) {
  const [hops, setHops] = useState(0);
  const [hello, setHello] = useState(false);
  useEffect(() => {
    if (!hello) return;
    const timer = setTimeout(() => setHello(false), 1400);
    return () => clearTimeout(timer);
  }, [hello]);
  return (
    <button
      className="site-hello"
      aria-label="Say hello to Glim"
      onClick={() => {
        setHops((n) => n + 1);
        setHello(true);
      }}
    >
      <Glim3D tone={tone} mood={hello ? 'happy' : mood} size={size} hop={hops} />
      <span className="site-hello-text" aria-live="polite">
        {hello ? 'Hello.' : ''}
      </span>
    </button>
  );
}

// Every fact, one under another, each under a line. Beside the walkthrough (onPick) the line
// fills as you scroll through that part, and the fact the island is showing is lit.
function Facts({ step, onPick }: { step: number; onPick?: (i: number) => void }) {
  return (
    <ol className={`site-facts${onPick ? ' is-steps' : ''}`} data-show>
      {FACTS.map((fact, i) => {
        const state = !onPick ? '' : i < step ? ' is-done' : i === step ? ' is-active' : '';
        return (
          <li key={fact.title} className={`site-fact${state}`} style={at(i + 1)}>
            <i className="site-fact-line" aria-hidden="true">
              <b />
            </i>
            <div>
              <h3>
                {onPick ? (
                  <button onClick={() => onPick(i)} aria-current={i === step ? 'step' : undefined}>
                    {fact.title}
                  </button>
                ) : (
                  fact.title
                )}
              </h3>
              <p>{fact.text}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

const SEVERAL = groupSessions(onSite(SCENARIOS.several.build(T0), 'details'), SEEN);

// A MacBook's camera notch, in points, for the island shown as on a Mac.
const DEMO_NOTCH = { width: 200, height: 32 };

function Site() {
  // Wide enough to open the island beside the copy without covering it.
  const wide = useMedia('(min-width: 1200px) and (min-height: 700px)');
  const [sessions, setSessions] = useState(() => onSite(SCENES.hero.build(T0), 'hero'));
  const [seenAt, setSeenAt] = useState(SEEN);
  const [view, setView] = useState<View>('compact');
  const [prefs, setPrefs] = useState<Preferences>(PREFS);
  const [connectors, setConnectors] = useState<Connector[]>(() =>
    structuredClone(previewConnectors),
  );
  const [scene, setScene] = useState<SceneId>('hero');
  const [shown, setShown] = useState<string | null>(null);
  // The system the island and the install steps are shown for: the visitor's, until they switch.
  const [system, setSystem] = useState<System>(SYSTEM);
  // A visitor who clicks takes over the island until they scroll into the next part.
  const [pinned, setPinned] = useState(false);
  const manual = useRef(false);
  // After a Try it click, the hero's agents hold still for a while.
  const quietUntil = useRef(0);
  const group = useRef('hero');
  const [width, setWidth] = useState(() => window.innerWidth);
  const [scrolled, setScrolled] = useState(false);
  const big = useMedia('(min-width: 900px)');
  // Phones skip the hero's shader: it redraws the whole width every frame.
  const phone = useMedia('(max-width: 720px)');
  const span = Math.min(1920, Math.round(width / 40) * 40);
  // The room beside the call-to-action panel sets how big the Glims peeking from it are; with too
  // little room, they stay away.
  const room = (width - Math.min(1120, width - 2 * Math.min(40, Math.max(16, width * 0.04)))) / 2;
  const cheer = room < 70 ? 0 : Math.round(Math.min(240, Math.max(150, room * 1.2)) / 10) * 10;
  const tone = useIslandTone();
  const words = useClearing();

  // A link to a section lands on it once the page has drawn it (the browser looks too early).
  useEffect(() => {
    if (location.hash)
      document.querySelector(location.hash)?.scrollIntoView({ behavior: 'instant' });
  }, []);

  // The island lights the Glims, so they take its color too.
  useEffect(() => {
    void import('./mascot3d').then(({ setLight }) => setLight(SPILL[tone] ?? SPILL.calm));
  }, [tone]);

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
    setSessions(onSite(build(t), group.current));
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

  // Left alone, the agent in the hero and the call to action plays a whole turn on a loop. A Try it
  // click holds it for a while; then it carries on from where it was.
  useEffect(() => {
    if ((scene !== 'hero' && scene !== 'close') || view !== 'compact' || !motionOk()) return;
    let timer = 0;
    let i = 1;
    const next = () => {
      if (Date.now() >= quietUntil.current) {
        const step = FLOW[i % FLOW.length][1];
        const work = workOf(group.current);
        const patch: Partial<Session> =
          step === 'work' ? { activity: 'working', detail: work[i % work.length] } : step;
        setSessions((list) =>
          list.map((s) => (s.parentId ? s : { ...s, ...patch, updatedAt: Date.now() })),
        );
        i++;
      }
      timer = window.setTimeout(next, FLOW[(i - 1) % FLOW.length][0]);
    };
    timer = window.setTimeout(next, FLOW[0][0]);
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
    // Parts wait until they are well in view, so nothing is seen half-arrived at the bottom.
    const parts = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          (entry.target as HTMLElement).dataset.in = '';
          parts.unobserve(entry.target);
        }
      },
      { rootMargin: '0px 0px -24% 0px' },
    );
    document.querySelectorAll('[data-show]:not([data-in])').forEach((el) => parts.observe(el));
    return () => {
      observer.disconnect();
      parts.disconnect();
    };
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
                detail: pick(workOf(group.current)),
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
  // Only setters and refs inside, so the first copy serves every render and the cards stay memoized.
  const show = useCallback((state: State) => {
    takeOver();
    setShown(state.title);
    setView('compact');
    load(state.build, !!state.paused);
  }, []);
  // On a phone the state cards swipe sideways. The one that settles in front goes on the island,
  // as a tap would.
  const stateGrid = useRef<HTMLUListElement>(null);
  const shownNow = useRef(shown);
  shownNow.current = shown;
  useEffect(() => {
    const grid = stateGrid.current;
    if (!phone || !grid) return;
    let timer = 0;
    const showAt = (index: number) => {
      const state = STATES[index];
      if (state && state.title !== shownNow.current) show(state);
    };
    const nearest = () => {
      const card = grid.firstElementChild as HTMLElement | null;
      if (!card) return;
      const stride = card.offsetWidth + parseFloat(getComputedStyle(grid).columnGap);
      showAt(Math.round(grid.scrollLeft / stride));
    };
    const settle = () => {
      clearTimeout(timer);
      timer = window.setTimeout(nearest, 80);
    };
    // Where the browser says which card a swipe will settle on, that card shows while it still
    // slides; elsewhere, just after the swipe ends.
    const changing = (event: Event) => {
      const target = (event as Event & { snapTargetInline?: Element | null }).snapTargetInline;
      if (target) showAt([...grid.children].indexOf(target));
    };
    grid.addEventListener('scroll', settle, { passive: true });
    grid.addEventListener('scrollsnapchanging', changing);
    return () => {
      grid.removeEventListener('scroll', settle);
      grid.removeEventListener('scrollsnapchanging', changing);
      clearTimeout(timer);
    };
  }, [phone, show]);
  const step = scene === 'details-details' ? 1 : scene === 'details-usage' ? 2 : 0;
  const pickFact = (i: number) => {
    manual.current = false;
    setView(SCENES[FACTS[i].scene].view ?? 'glance');
    document.querySelector(`[data-scene="${FACTS[i].scene}"]`)?.scrollIntoView({ block: 'center' });
  };

  const current = STATES.find((state) => state.title === shown) ?? STATES[0];
  return (
    <div className="site" id="top">
      <div
        // Small while reading; it spreads wide only in the states section, where color is the point.
        className={`site-spill${scene === 'states' ? ' is-wide' : ''}`}
        style={{ '--spill': SPILL[tone] ?? SPILL.calm } as CSSProperties}
        aria-hidden="true"
      />
      <div className="site-edge" aria-hidden="true" />
      <div className="site-island">
        <AppIsland
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
          fast={shown === 'Several agents'}
          notch={system === 'macOS' && !phone ? DEMO_NOTCH : null}
        />
      </div>

      <header className={`site-top${scrolled ? ' is-scrolled' : ''}`}>
        <div className="site-pill site-pages">
          <Brand root="" />
          <PageLinks root="" />
        </div>
        <nav className="site-pill site-nav" aria-label="Glim">
          <a className="site-link site-anchor" href="#states">
            States
          </a>
          <a className="site-link site-anchor" href="#privacy">
            Privacy
          </a>
          <GetLinks />
        </nav>
      </header>

      <main>
        <section
          className="site-hero"
          data-scene="hero"
          aria-labelledby="site-title"
          style={{ '--span': `${span}px` } as CSSProperties}
        >
          {!phone && (
            <FaultyTerminal
              className="site-terminal"
              aria-hidden="true"
              scale={1.5}
              digitSize={1.2}
              timeScale={0.5}
              scanlineIntensity={0.5}
              curvature={0.1}
              tint="#a5b4fc"
              mouseStrength={0.25}
              brightness={0.6}
              // Half resolution: a quarter of the pixels to shade, and the dots stay soft.
              dpr={0.5}
            />
          )}
          <div className="site-hero-copy" ref={words}>
            <h1 id="site-title" style={at(0)}>
              A glimpse at your agents. <span>Then back to your flow.</span>
            </h1>
            <p className="site-sub" style={at(1)}>
              Glim sits at the top of your screen and shows what Claude Code and Codex are doing, so
              you can stay in your own work.
            </p>
            <div className="site-cta" style={at(2)}>
              <DownloadLink className="site-button">
                <Download size={19} strokeWidth={2.4} aria-hidden="true" />
                Download for {SYSTEM}
              </DownloadLink>
              <a className="site-more" href={REPO} target="_blank" rel="noreferrer">
                View on GitHub <ArrowUpRight size={17} aria-hidden="true" />
              </a>
            </div>
            <p className="site-meta" style={at(3)}>
              {NEEDS[SYSTEM]} ·{' '}
              <DownloadLink system={OTHER} className="site-also">
                Also for {OTHER}
              </DownloadLink>{' '}
              · Free and open source · No account
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
                <button
                  disabled={!canFire}
                  onClick={() => fire({ activity: 'limited', detail: 'Usage limit reached' })}
                >
                  Hit a limit
                </button>
                <button onClick={() => fire('work')}>Back to work</button>
              </div>
              <p>The agent on the island reacts. It runs on sample sessions.</p>
              {!phone && (
                <div className="site-try-system">
                  <span aria-hidden="true">See it on</span>
                  <SystemSwitch value={system} onChange={setSystem} label="See the island on" />
                </div>
              )}
            </div>
          </div>
          <div className="site-crowd" aria-hidden="true">
            {(width < 720 ? PHONE_CROWD : CROWD).map((glim, i) => {
              const brand = glim.tone === 'brand';
              return (
                <span
                  key={i}
                  className="site-peek"
                  style={{
                    ...at(i),
                    left: `${glim.x}%`,
                    bottom: `calc(var(--base) + ${Math.round(span * glim.lift)}px)`,
                    zIndex: glim.depth,
                    rotate: `${glim.tilt}deg`,
                  }}
                >
                  <Glim3D
                    tone={glim.tone}
                    // The indigo one reacts to the island.
                    mood={brand ? (MOOD_OF[tone] ?? 'open') : glim.mood}
                    size={Math.min(460, Math.round(span * glim.share))}
                    ratio={1.5}
                  />
                </span>
              );
            })}
          </div>
          <div className="site-horizon" aria-hidden="true" />
        </section>

        <section
          className="site-section site-reveal"
          id="states"
          data-scene="states"
          aria-labelledby="states-title"
        >
          <div className="site-wrap site-states">
            <div className="site-states-glim" data-tone={current.tone} data-show>
              <Glim3D tone={current.tone} mood={current.mood} size={big ? 240 : 180} />
            </div>
            <h2 id="states-title" className="site-rise" data-show>
              <span>Every state has its own color.</span>
            </h2>
            <p className="site-lede site-rise" data-show>
              <span>
                Look up, see which agent needs you, look back down. Pick one to put it on the
                island.
              </span>
            </p>
            <ul className="site-state-grid" ref={stateGrid} data-keep-open data-show>
              {STATES.map((state, i) => (
                <StateCard
                  key={state.title}
                  state={state}
                  index={i}
                  shown={shown === state.title}
                  onShow={show}
                />
              ))}
            </ul>
          </div>
        </section>

        {wide ? (
          // The island opens itself here and changes view as the visitor scrolls.
          <section
            className="site-scrolly site-details site-reveal"
            aria-labelledby="details-title"
          >
            <div className="site-scrolly-stage" data-keep-open>
              <div className="site-scrolly-copy">
                <h2 id="details-title" className="site-rise" data-show>
                  <span>Open it for the details.</span>
                </h2>
                <p className="site-lede site-rise" data-show>
                  <span>
                    One click shows every agent at once. Scroll, and the island above walks through
                    what is inside.
                  </span>
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
            className="site-section site-details site-reveal"
            data-scene="details"
            aria-labelledby="details-title"
          >
            <div className="site-wrap site-split">
              <div>
                <h2 id="details-title" className="site-rise" data-show>
                  <span>Open it for the details.</span>
                </h2>
                <p className="site-lede site-rise" data-show>
                  <span>
                    One click shows every agent at once, with the one that needs you first.
                  </span>
                </p>
                <Facts step={step} />
              </div>
              <div className="site-item" style={at(2)} data-show>
                <Fit width={480}>
                  <div className="desk desk-view site-art" inert>
                    <StaticIsland width={440}>
                      <Glance groups={SEVERAL} focusId="demo-claude" now={T0} paused={false} />
                    </StaticIsland>
                  </div>
                </Fit>
              </div>
            </div>
          </section>
        )}

        <section
          className="site-section site-reveal"
          id="privacy"
          data-scene="privacy"
          aria-labelledby="privacy-title"
        >
          <div className="site-wrap">
            <div className="site-privacy-head">
              <h2 id="privacy-title" className="site-rise" data-show>
                <span>Stays on your computer.</span>
              </h2>
              <p className="site-lede site-rise" data-show>
                <span>
                  Your agents tell Glim what they are doing through a private channel only your
                  account can open. Glim keeps the little it needs on this computer, and nothing
                  goes online.
                </span>
              </p>
            </div>
            <div className="site-vault">
              <article data-show className="site-vault-card is-pipe" style={at(0)}>
                <div className="site-vault-art">
                  <Fit width={600}>
                    <LocalPipe />
                  </Fit>
                </div>
                <h3>No account, no cloud.</h3>
                <p>No sign-in and no API key. No telemetry and no sync.</p>
              </article>
              <article data-show className="site-vault-card is-kept" style={at(1)}>
                <div className="site-vault-art">
                  <Kept />
                </div>
                <h3>No prompts kept.</h3>
                <p>
                  Glim never stores prompts, responses, tool output or credentials. It keeps
                  counters, names and task labels for 30 days.
                </p>
              </article>
              <article data-show className="site-vault-card is-changes" style={at(0)}>
                <div className="site-vault-art" data-keep-open>
                  <Fit width={400}>
                    <StaticIsland width={380}>
                      <div className="sheet site-vault-sheet">
                        <section className="sec">
                          <h4>Agents</h4>
                          <Connectors
                            list={connectors}
                            onChange={setConnectors}
                            initialOpen="claude"
                          />
                        </section>
                      </div>
                    </StaticIsland>
                  </Fit>
                </div>
                <h3>Every change shown.</h3>
                <p>
                  Connecting shows each entry Glim adds to your agent’s settings and keeps a backup.
                  Disconnecting removes only Glim’s entries.
                </p>
              </article>
              <article data-show className="site-vault-card is-pause" style={at(1)}>
                <div
                  className="site-vault-art"
                  data-keep-open
                  data-asleep={prefs.paused || undefined}
                >
                  <span className="site-zs" aria-hidden="true">
                    {[0, 1, 2].map((i) => (
                      <b key={i} style={at(i)}>
                        Z
                      </b>
                    ))}
                  </span>
                  <div className="site-sleeper">
                    <Glim3D
                      // Grey while asleep, like the island when monitoring is paused; awake, the blue of the
                      // working agent the island goes back to (and not indigo on an indigo card).
                      tone={prefs.paused ? 'calm' : 'active'}
                      mood={prefs.paused ? 'closed' : 'open'}
                      size={big ? 440 : 300}
                      ratio={1.5}
                      follow={!prefs.paused}
                    />
                  </div>
                  <div className="gl site-pause">
                    <Switch
                      label="Pause monitoring"
                      checked={prefs.paused}
                      onChange={(paused) => {
                        takeOver();
                        setPrefs((p) => ({ ...p, paused }));
                      }}
                    />
                  </div>
                </div>
                <h3>Pause anytime.</h3>
                <p>
                  One switch in Glim's menu or in Settings stops collection until you turn it back
                  on. Try it: the island above sleeps too.
                </p>
              </article>
            </div>
          </div>
        </section>

        <section
          className="site-section site-reveal"
          id="install"
          data-scene="install"
          aria-labelledby="install-title"
        >
          <div className="site-wrap">
            <h2 id="install-title" className="site-rise" data-show>
              <span>Three steps, then back to work.</span>
            </h2>
            <SystemSwitch value={system} onChange={setSystem} label="Install steps for" />
            <ol className="site-steps" data-show>
              <li className="site-item" style={at(0)}>
                <b>Download</b>
                <span>
                  {system === 'macOS'
                    ? 'Get Glim from GitHub Releases. macOS 13 or later, on Apple silicon or Intel.'
                    : 'Get the installer from GitHub Releases. Windows 11, 64-bit.'}
                </span>
              </li>
              <li className="site-item" style={at(1)}>
                <b>Install</b>
                <span>
                  {system === 'macOS'
                    ? 'Open it and drag Glim to Applications. Apple has not notarized Glim yet, so the first time, open System Settings, then Privacy & Security, and choose Open Anyway.'
                    : 'It installs for your account only, so no administrator rights. If Windows warns about a new app, choose More info, then Run anyway.'}
                </span>
              </li>
              <li className="site-item" style={at(2)}>
                <b>Connect</b>
                <span>
                  Pick Claude Code, Codex or both. Glim shows what it will add before it adds it.
                  For Codex, then trust the Glim hooks in <code>/hooks</code>.
                </span>
              </li>
            </ol>
            <div className="site-works" data-show>
              <span className="site-agent">
                <img src={`${ASSETS}providers/claude.svg`} width={22} height={22} alt="" />
                Claude Code
              </span>
              <span className="site-agent">
                <i className="site-codex" aria-hidden="true" />
                Codex CLI
              </span>
              <p>
                In the terminals you already use: Terminal, iTerm2, Warp, Ghostty, Windows Terminal
                and the one in your IDE. WSL and remote sessions are not supported yet.
              </p>
            </div>
          </div>
        </section>

        <section
          className="site-section site-close site-reveal"
          data-scene="close"
          aria-labelledby="close-title"
        >
          <div
            className="site-cta-stage"
            style={{ '--cta-glow': SPILL[tone] ?? SPILL.calm } as CSSProperties}
          >
            {cheer > 0 &&
              CHEER.map((glim, i) => {
                const size = Math.round(cheer * glim.scale);
                // How far past the panel's edge the face's center sits: as the Glim asks, or, where
                // the room is narrower, the middle of the room, so both eyes stay in view.
                const reach = Math.min((glim.out / 100 - 0.5) * size, room / 2);
                return (
                  <span
                    key={i}
                    className={`site-cheer is-${glim.side}`}
                    style={
                      {
                        ...at(i % 3),
                        top: `${glim.at}%`,
                        '--out': `${Math.round(reach + size / 2)}px`,
                        '--tilt': `${glim.tilt}deg`,
                      } as CSSProperties
                    }
                    aria-hidden="true"
                  >
                    <Glim3D tone={glim.tone} mood={glim.mood} size={size} ratio={1.5} />
                  </span>
                );
              })}
            {/* The call to action: a squircle lit from above in the color of what the notch shows. */}
            <div className="site-cta-panel">
              <Hello
                size={big ? 220 : 160}
                // It wears what the notch shows.
                tone={tone as GlimTone}
                mood={MOOD_OF[tone] ?? 'open'}
              />
              <h2 id="close-title">Glim is ready when you are.</h2>
              <p className="site-lede">
                Free, open source and on your own machine. Download it, connect your agents, and get
                back to your work.
              </p>
              <div className="site-close-cta site-item" style={at(1)}>
                <DownloadLink className="site-button site-button-light">
                  <Download size={19} strokeWidth={2.4} aria-hidden="true" />
                  Download for {SYSTEM}
                </DownloadLink>
                <a className="site-more" href={REPO} target="_blank" rel="noreferrer">
                  View on GitHub <ArrowUpRight size={17} aria-hidden="true" />
                </a>
              </div>
              <p className="site-meta">
                {NEEDS[SYSTEM]} ·{' '}
                <DownloadLink system={OTHER} className="site-also">
                  Also for {OTHER}
                </DownloadLink>{' '}
                · MIT license
              </p>
            </div>
          </div>
        </section>
      </main>

      <GradualBlur
        target="page"
        position="bottom"
        height="9rem"
        strength={2.5}
        divCount={6}
        curve="bezier"
        exponential
        // Slid in by a scroll-driven animation in site.css while the call to action rises; parked
        // below the window where that is not supported. Under the navbar (45) and the island.
        className="site-haze"
        style={{ zIndex: 40 }}
      />
      <SiteFoot root="" />
    </div>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* Glim is 3D everywhere on the site, in the island too. */}
    <GlimDrawing.Provider value={Glim3DInPlace}>
      <Site />
    </GlimDrawing.Provider>
  </StrictMode>,
);
