// Claude's UI-only redesign proposal for Glim, served by the dev server at /preview-claude.
// It renders ./island with the app's own sample data; nothing in src/ is modified.
import { StrictMode, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { ArrowUpRight } from 'lucide-react';
import '@fontsource-variable/manrope';
import './style.css';
import scenes from '../src/preview-scenes.json';
import { previewConnectors } from '../src/preview';
import { DEFAULT_PREFERENCES, type Connector, type Preferences, type Session } from '../src/types';
import {
  allDone,
  Compact,
  Details,
  Glance,
  groupSessions,
  notchView,
  LiveIsland,
  sample,
  SCENARIOS,
  SettingsSheet,
  SetupSheet,
  StaticIsland,
  T0,
  UsageSheet,
  type Group,
  type ScenarioKey,
  type View,
} from './island';
import { AppIcon, LogoStage, Mark, MascotStage, MoodStrip, type Mood } from './brand';
import {
  FinishScreen,
  InstallingScreen,
  UninstallScreen,
  UpdateScreen,
  WelcomeScreen,
} from './installer';

const SEEN = T0 - 60_000;
const groupsOf = (sessions: Session[]) => groupSessions(sessions, SEEN);
const PREFS: Preferences = { ...DEFAULT_PREFERENCES, onboardingComplete: true };

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

function Choice<T extends string>({
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
    <div className="control">
      <span id={`control-${label}`}>{label}</span>
      <div className="pseg" role="group" aria-labelledby={`control-${label}`}>
        {options.map(([option, text]) => (
          <button key={option} aria-pressed={option === value} onClick={() => onChange(option)}>
            {text}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ---------------- Live island ---------------- */

interface Look {
  mood: Mood;
}

function Live({ onLook }: { onLook: (look: Look) => void }) {
  const [scenario, setScenario] = useState<ScenarioKey>('several');
  const [sessions, setSessions] = useState(() => SCENARIOS.several.build(T0));
  const [seenAt, setSeenAt] = useState(SEEN);
  const [view, setView] = useState<View>('compact');
  const [prefs, setPrefs] = useState<Preferences>(PREFS);
  const [connectors, setConnectors] = useState<Connector[]>(() =>
    structuredClone(previewConnectors),
  );
  // Simulated agent events, so the notch can show what it does when something happens.
  const working = sessions.filter((s) => !s.parentId && s.activity === 'working');
  const fire = (event: Partial<Session> | 'work') =>
    setSessions((list) => {
      const at = Date.now();
      if (event === 'work')
        return list.map((s) =>
          s.parentId || s.activity === 'working'
            ? s
            : { ...s, activity: 'working' as const, detail: 'Thinking', updatedAt: at },
        );
      const target = list.filter((s) => !s.parentId && s.activity === 'working').at(-1);
      return list.map((s) => (s.id === target?.id ? { ...s, ...event, updatedAt: at } : s));
    });
  const desk = useRef<HTMLDivElement>(null);
  const [deskWidth, setDeskWidth] = useState(960);
  useLayoutEffect(() => {
    const el = desk.current;
    if (!el) return;
    const observer = new ResizeObserver(() => setDeskWidth(el.clientWidth));
    observer.observe(el);
    setDeskWidth(el.clientWidth);
    return () => observer.disconnect();
  }, []);
  // The page logo's eyes follow the island's current state; its color stays Glim indigo.
  const top = groupSessions(sessions, seenAt)[0];
  const mood: Mood = prefs.paused ? 'closed' : top ? top.look.mood : 'open';
  useEffect(() => onLook({ mood }), [mood, onLook]);
  const pick = (key: ScenarioKey) => {
    const t = Date.now();
    setScenario(key);
    setSessions(SCENARIOS[key].build(t));
    setSeenAt(t - 60_000);
    setPrefs((p) => ({ ...p, paused: !!SCENARIOS[key].paused }));
  };
  return (
    <section className="stage" aria-label="Interactive island">
      <div className="intro">
        <h1>Glim, rearranged</h1>
        <p>
          Claude’s take on the island, built as a working page. UI only: the app and its code are
          untouched, and everything here runs on the app’s own sample data.
        </p>
      </div>
      <div className="desk desk-live" ref={desk}>
        <LiveIsland
          sessions={sessions}
          seenAt={seenAt}
          onSeen={setSeenAt}
          view={view}
          onView={setView}
          prefs={prefs}
          onPrefs={setPrefs}
          connectors={connectors}
          onConnectors={setConnectors}
          maxWidth={deskWidth - 40}
        />
        {view === 'compact' && <p className="desk-hint">Click the island</p>}
      </div>
      <div className="controls" data-keep-open>
        <Choice
          label="Agents"
          value={scenario}
          options={(Object.keys(SCENARIOS) as ScenarioKey[]).map((key) => [
            key,
            SCENARIOS[key].label,
          ])}
          onChange={pick}
        />
        <div className="control">
          <span id="control-simulate">Simulate</span>
          <div className="pseg" role="group" aria-labelledby="control-simulate">
            <button
              disabled={!working.length}
              onClick={() => fire({ activity: 'waiting', detail: 'Waiting for approval' })}
            >
              Approval
            </button>
            <button
              disabled={!working.length}
              onClick={() => fire({ activity: 'idle', detail: 'Turn finished' })}
            >
              Turn done
            </button>
            <button
              disabled={!working.length}
              onClick={() => fire({ activity: 'error', detail: 'Agent reported an error' })}
            >
              Error
            </button>
            <button onClick={() => fire('work')}>Back to work</button>
          </div>
          <p className="controls-note">
            A new event takes over the notch for a few seconds, then moves to the banner below it.
          </p>
        </div>
        <Choice
          label="Open"
          value={view}
          options={[
            ['compact', 'Compact'],
            ['glance', 'Glance'],
            ['details', 'Details'],
            ['settings', 'Settings'],
            ['usage', 'Usage'],
            ['setup', 'Setup'],
          ]}
          onChange={setView}
        />
        <p className="controls-note">Esc or a click outside closes the island.</p>
      </div>
    </section>
  );
}

/* ---------------- States ---------------- */

interface StateCard {
  title: string;
  note: string;
  groups: Group[];
  paused?: boolean;
}
const claude = sample('demo-claude', T0);
const STATES: StateCard[] = [
  {
    title: 'Working',
    note: 'Blue, with eyes that glance side to side while it works.',
    groups: groupsOf([claude]),
  },
  {
    title: 'Needs approval',
    note: 'Amber and wide-eyed, with light spilling under the island. The count is how long it has waited.',
    groups: groupsOf([sample('demo-codex', T0, { updatedAt: T0 - 128_000 })]),
  },
  {
    title: 'Your turn',
    note: 'Teal and skipping when an agent hands the turn back. It settles to Ready once you have looked.',
    groups: groupsOf([
      sample('demo-claude', T0, {
        activity: 'idle',
        detail: 'Turn finished',
        updatedAt: T0 - 9000,
        tasks: allDone(claude),
      }),
    ]),
  },
  {
    title: 'Error',
    note: 'Red with crossed eyes and a short shake every few seconds, until the agent moves on.',
    groups: groupsOf([
      sample('demo-claude', T0, {
        activity: 'error',
        detail: 'Agent reported an error',
        updatedAt: T0 - 14_000,
      }),
    ]),
  },
  {
    title: 'Interrupted',
    note: 'Half-closed and grey, with a slow sleepy blink. You stopped it, so there is nothing to chase.',
    groups: groupsOf([
      sample('demo-claude', T0, {
        activity: 'interrupted',
        detail: 'Turn interrupted',
        updatedAt: T0 - 30_000,
      }),
    ]),
  },
  {
    title: 'Done',
    note: 'Green with content eyes and one small hop: the session ended and nothing is waiting on you.',
    groups: groupsOf([
      sample('demo-claude', T0, {
        activity: 'finished',
        detail: 'Session ended',
        updatedAt: T0 - 300_000,
        tasks: allDone(claude),
      }),
    ]),
  },
  {
    title: 'Several agents',
    note: 'Working agents take turns in the notch, one dot each. What needs you waits in the banner below until it is handled.',
    groups: groupsOf(SCENARIOS.several.build(T0)),
  },
  {
    title: 'Paused',
    note: 'Closed eyes and a slow breath until you resume monitoring.',
    groups: groupsOf([claude]),
    paused: true,
  },
  { title: 'No agents', note: 'Neutral and blinking. Nothing to report.', groups: [] },
  {
    title: 'Long task',
    note: 'The island is as wide as its text, up to 360px. Past that the task scrolls right to left while the project stays put; hover to pause.',
    groups: groupsOf(SCENARIOS.long.build(T0)),
  },
];
const TRAY: [string, 'brand' | 'attention' | 'success' | 'error'][] = [
  ['Ready', 'brand'],
  ['Needs you', 'attention'],
  ['Your turn', 'success'],
  ['Error', 'error'],
];

function StateTile({ card }: { card: StateCard }) {
  // The glow follows what the notch row shows, exactly as on the live island.
  const view = notchView(card.groups, SEEN, T0);
  const tone = card.paused || !view.current ? 'calm' : view.current.look.tone;
  return (
    <figure className="state">
      <div className="desk desk-compact" inert>
        <Fit width={400}>
          <div className="slot">
            <StaticIsland tone={tone} compact>
              <Compact view={view} paused={!!card.paused} now={T0} />
            </StaticIsland>
          </div>
        </Fit>
      </div>
      <figcaption>
        <b>{card.title}</b>
        <span>{card.note}</span>
      </figcaption>
    </figure>
  );
}

/* ---------------- Views ---------------- */

function SettingsDemo() {
  const [prefs, setPrefs] = useState(PREFS);
  const [connectors, setConnectors] = useState(() => structuredClone(previewConnectors));
  return (
    <SettingsSheet
      prefs={prefs}
      onPrefs={setPrefs}
      connectors={connectors}
      onConnectors={setConnectors}
      initialOpen="claude"
    />
  );
}
function SetupDemo({ step }: { step: number }) {
  const [prefs, setPrefs] = useState(PREFS);
  const [connectors, setConnectors] = useState(() =>
    structuredClone(previewConnectors).map((c) => ({ ...c, enabled: false })),
  );
  return (
    <SetupSheet
      prefs={prefs}
      onPrefs={setPrefs}
      connectors={connectors}
      onConnectors={setConnectors}
      initialStep={step}
      initialOpen={step === 1 ? 'claude' : null}
    />
  );
}

interface ViewCard {
  id: string;
  title: string;
  current: string;
  notes: string[];
  interactive?: boolean;
  render: () => ReactNode;
}
const several = groupsOf(SCENARIOS.several.build(T0));
const VIEWS: ViewCard[] = [
  {
    id: 'urgent',
    title: 'Glance: who needs you leads',
    current: 'approval',
    notes: [
      'The blocked agent leads, with how long it has waited and where to answer.',
      'Every other agent is one row. The hidden “3 ▾” menu is gone.',
      'glim-desktop shows +2: subagents fold into their parent instead of counting as agents.',
    ],
    render: () => <Glance groups={several} now={T0} paused={false} />,
  },
  {
    id: 'focus',
    title: 'Glance: one agent in depth',
    current: 'working',
    notes: [
      'Context and the 5-hour limit are meters that turn amber at 75% and red at 90%.',
      'The current step leads; pips show the whole plan without a second progress bar.',
      'Tokens move to the footnote. They are the least actionable number here.',
    ],
    render: () => <Glance groups={several} focusId="demo-claude" now={T0} paused={false} />,
  },
  {
    id: 'details',
    title: 'Details',
    current: 'details',
    notes: [
      'Budget, then plan, then the token ledger: the order you act on them.',
      'Tabular, right-aligned numbers, and a total that says what it adds up.',
      'Missing values say Unavailable instead of a bare dash.',
    ],
    render: () => <Details group={groupsOf([claude])[0]} now={T0} />,
  },
  {
    id: 'settings',
    title: 'Settings',
    current: 'settings',
    interactive: true,
    notes: [
      'Connected is a status. In the current app, one click on “✓ Connected” disconnects the agent.',
      'Disconnect lives in the details and confirms once, naming the file it edits.',
      'Switches are monochrome. Color stays reserved for agent state.',
    ],
    render: () => <SettingsDemo />,
  },
  {
    id: 'usage',
    title: 'Usage',
    current: 'history',
    interactive: true,
    notes: [
      'Period and agent are one-tap segments instead of three dropdowns.',
      'One line of totals replaces four large tiles; the chart is the view.',
      'Hover a day to read it. Projects get proportional bars.',
    ],
    render: () => <UsageSheet />,
  },
  {
    id: 'welcome',
    title: 'Setup: welcome',
    current: 'welcome',
    interactive: true,
    notes: [
      'The mascot is the status light at full size, so setup introduces the eyes before they matter.',
      'A plain white primary button. The animated star border is gone.',
    ],
    render: () => <SetupDemo step={0} />,
  },
  {
    id: 'connect',
    title: 'Setup: connect',
    current: 'connect',
    interactive: true,
    notes: [
      'Each agent previews exactly what Glim will add before anything changes.',
      'After connecting, the agent’s own next step, like trusting hooks in Codex, is spelled out.',
    ],
    render: () => <SetupDemo step={1} />,
  },
  {
    id: 'empty',
    title: 'No agents',
    current: 'empty',
    notes: [
      'Says what happens next instead of only “No active agents”.',
      'The eyes follow your pointer on empty and welcome screens, where nothing else moves.',
    ],
    render: () => <Glance groups={[]} now={T0} paused={false} />,
  },
];

function Current({ scene }: { scene: string }) {
  const meta = scenes.find((s) => s.id === scene);
  const height = Math.min(meta?.height ?? 300, 640);
  return (
    <Fit width={480}>
      <div className="desk desk-current" style={{ height }}>
        <iframe
          title={`Current app: ${meta?.title ?? scene}`}
          src={`/?scene=${scene}&motion=0`}
          width={480}
          height={height}
          loading="lazy"
        />
      </div>
    </Fit>
  );
}

function ViewTile({ card, compare }: { card: ViewCard; compare: boolean }) {
  return (
    <article className={`view${compare ? ' compare' : ''}`} id={card.id}>
      {compare && (
        <div className="view-frame">
          <p className="frame-label">Current</p>
          <Current scene={card.current} />
        </div>
      )}
      <div className="view-frame">
        {compare && <p className="frame-label">Proposed</p>}
        <Fit width={480}>
          <div className="desk desk-view" inert={!card.interactive}>
            <StaticIsland width={440}>{card.render()}</StaticIsland>
          </div>
        </Fit>
      </div>
      <div className="view-notes">
        <h3>{card.title}</h3>
        <ul>
          {card.notes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      </div>
    </article>
  );
}

/* ---------------- Installation ---------------- */

function FirstLaunch() {
  return (
    <div className="desk desk-launch">
      <StaticIsland width={440}>
        <SetupDemo step={0} />
      </StaticIsland>
    </div>
  );
}
const INSTALL: [string, string, ReactNode][] = [
  [
    '1 · Welcome',
    'Install is the first button. The folder page is gone; the default per-user folder is stated instead. The sidebar shows the character centered on a slice of desktop.',
    <WelcomeScreen />,
  ],
  [
    '2 · Installing',
    'Moves on by itself when done. The log stays one click away.',
    <InstallingScreen />,
  ],
  [
    '3 · Finish',
    'Happy eyes. Open Glim is ticked; the desktop shortcut is not, since Glim lives at the top of the screen.',
    <FinishScreen />,
  ],
  [
    '4 · First launch',
    'Glim appears at the top of the screen and opens setup on its own, as it already does today.',
    <FirstLaunch />,
  ],
  [
    'Update',
    'Replaces the maintenance radio buttons when an older version is installed. Only true once the uninstall hook stops disconnecting agents during updates.',
    <UpdateScreen />,
  ],
  [
    'Uninstall',
    'Says what it removes. Its checkbox deletes usage history, which is what people expect; today’s “Delete the application data” leaves the history behind.',
    <UninstallScreen />,
  ],
];

/* ---------------- Page ---------------- */

const IDEAS: [string, string][] = [
  [
    'Working agents take turns',
    'With several agents working, the notch shows each in turn. Anything that needs you takes over the notch for a moment, then waits in a banner below it until it is handled.',
  ],
  [
    'Color means state, and only state',
    'Amber needs you, red failed, teal handed the turn back, green is done. Glim indigo belongs to the logo alone; Claude orange and Codex blue stay in their logos and the usage chart.',
  ],
  [
    'The mascot is the status light',
    'Tinted and animated per state, the Glim eyes replace the WebGL crystal ball. Readable from the corner of your eye, and nearly free to render.',
  ],
  [
    'Every agent at once',
    'The glance lists all sessions instead of hiding them behind “3 ▾”. Subagents fold into their parent session.',
  ],
  [
    'Budget before bookkeeping',
    'Context and account limits become meters with warning thresholds. Token totals move to a footnote and a ledger.',
  ],
  [
    'Say how long',
    '“Needs approval · 2m” and “Your turn · 41s ago” tell you whether you are the bottleneck.',
  ],
  [
    'Statuses are not buttons',
    '“✓ Connected” no longer disconnects on click. Disconnecting is explicit and confirmed.',
  ],
  [
    'A smaller pill',
    '34px tall instead of 42px, and only as wide as its text, from 144 to 360px. Longer text scrolls instead of widening it.',
  ],
  [
    'Readable minimums',
    'Nothing under 11px, secondary text at 4.5:1 or better on black, tabular numerals for every number.',
  ],
  ['One motion idea', 'The island’s spring and the eyes. No moving borders, no particle effects.'],
];

function Page() {
  const [compare, setCompare] = useState(false);
  const [look, setLook] = useState<Look>({ mood: 'open' });
  return (
    <main className="page">
      <header className="top">
        <a className="brand" href="/preview-claude">
          <Mark size={36} mood={look.mood} />
          Glim
        </a>
        <nav className="top-links" aria-label="Other views">
          <a href="/preview">
            Current views <ArrowUpRight size={14} />
          </a>
          <a href="/">
            Current app <ArrowUpRight size={14} />
          </a>
        </nav>
      </header>

      <Live onLook={setLook} />

      <section className="section" aria-labelledby="ideas">
        <div className="section-head">
          <h2 id="ideas">What changes</h2>
        </div>
        <ul className="ideas">
          {IDEAS.map(([title, text]) => (
            <li key={title}>
              <b>{title}</b>
              <span>{text}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="section" aria-labelledby="states">
        <div className="section-head">
          <div>
            <h2 id="states">Status at a glance</h2>
            <p>
              The compact island is on screen all day. Its eyes carry the state: fill is the color,
              shape is the mood.
            </p>
          </div>
        </div>
        <div className="states">
          {STATES.map((card) => (
            <StateTile key={card.title} card={card} />
          ))}
        </div>
      </section>

      <section className="section" aria-labelledby="views">
        <div className="section-head">
          <div>
            <h2 id="views">Every view</h2>
            <p>
              Settings, usage and setup work here. Turn on the comparison to see each view today.
            </p>
          </div>
          <label className="page-toggle">
            <input
              type="checkbox"
              checked={compare}
              onChange={(e) => setCompare(e.target.checked)}
            />
            Compare with the current app
          </label>
        </div>
        <div className="views">
          {VIEWS.map((card) => (
            <ViewTile key={card.id} card={card} compare={compare} />
          ))}
        </div>
      </section>

      <section className="section" aria-labelledby="brand">
        <div className="section-head">
          <div>
            <h2 id="brand">Logo and mascot</h2>
            <p>
              One character drawn from the island’s own outline. It is the logo, the app icon, the
              installer art and the island’s status light, and it moves with the island’s state.
            </p>
          </div>
        </div>
        <div className="views">
          <article className="view">
            <LogoStage />
            <div className="view-notes">
              <h3>Logo</h3>
              <ul>
                <li>
                  The island’s pod on its own: a flat top with rounded corners, sides that go
                  straight up, and a round bottom. Nothing sticks out, so it sits centered.
                </li>
                <li>
                  Big capsule eyes, a fifth of the body wide, so they read at 16px and can blink,
                  widen and squint.
                </li>
                <li>
                  The logo is alive: pick a state, or watch the logo at the top of this page follow
                  the island above. It is always Glim indigo with white eyes; only the eyes follow
                  the state.
                </li>
              </ul>
            </div>
          </article>
          <article className="view">
            <div className="brand-frame">
              <MascotStage />
              <MoodStrip />
            </div>
            <div className="view-notes">
              <h3>Mascot</h3>
              <ul>
                <li>
                  Click it, move your pointer, or pick a mood. Every mood is a real island state.
                </li>
                <li>
                  Fill is the state color; eye shape is the mood. The island’s status glyph is this
                  character at 28px.
                </li>
                <li>
                  It follows the pointer only on welcome and empty screens, where nothing else
                  moves.
                </li>
              </ul>
            </div>
          </article>
          <article className="view">
            <div className="brand-frame icons">
              <div className="taskbar">
                {[48, 32, 24, 16].map((size) => (
                  <AppIcon key={size} size={size} />
                ))}
              </div>
              <div className="taskbar dark">
                {[48, 32, 24, 16].map((size) => (
                  <AppIcon key={size} size={size} />
                ))}
              </div>
              <div className="tray">
                {TRAY.map(([label, tone]) => (
                  <figure key={label}>
                    <AppIcon size={24} tone={tone} />
                    <figcaption>{label}</figcaption>
                  </figure>
                ))}
              </div>
              <div className="before-after">
                <figure>
                  <AppIcon size={104} />
                  <figcaption>App icon</figcaption>
                </figure>
              </div>
            </div>
            <div className="view-notes">
              <h3>App icon</h3>
              <ul>
                <li>The character, centered on a slice of desktop.</li>
                <li>
                  The light tile stands out on dark and light taskbars alike. At 32px and below the
                  character grows, so the eyes stay visible at 16px.
                </li>
                <li>
                  The tray icon changes with the state (shown at 24px, 150% scaling), so a hidden
                  island can still tell you an agent is waiting.
                </li>
              </ul>
            </div>
          </article>
        </div>
      </section>

      <section className="section" aria-labelledby="install">
        <div className="section-head">
          <div>
            <h2 id="install">Installation</h2>
            <p>
              Today’s setup is the stock Tauri wizard: welcome, choose a folder, an install log that
              waits for Next, then a finish page with a desktop shortcut ticked. Proposed: one click
              to install, then Glim opens and takes over.
            </p>
          </div>
        </div>
        <ol className="install">
          {INSTALL.map(([title, note, screen]) => (
            <li key={title}>
              <Fit width={520}>
                <div className="install-frame">{screen}</div>
              </Fit>
              <b>{title}</b>
              <span>{note}</span>
            </li>
          ))}
        </ol>
      </section>

      <section className="section" aria-labelledby="code">
        <div className="section-head">
          <div>
            <h2 id="code">If you adopt it</h2>
            <p>Not done here, since this page leaves the app’s code alone.</p>
          </div>
        </div>
        <ul className="ideas">
          <li>
            <b>One stylesheet</b>
            <span>
              styles.css, details.css and design.css override each other, and many of their
              selectors (.glance-grid, .session-row, .avatar-stack, .panel-header…) match nothing
              the app renders. The tokens in preview-claude/style.css could replace all three.
            </span>
          </li>
          <li>
            <b>Less to ship</b>
            <span>
              The eyes replace CrystalizedBall, so the ogl dependency and its WebGL loop can go.
              StarBorder goes with the plain primary button.
            </span>
          </li>
          <li>
            <b>One new UI field</b>
            <span>
              “Your turn” needs the time the island was last opened, kept in the interface. The
              collector and data model stay as they are.
            </span>
          </li>
        </ul>
      </section>

      <footer className="foot">
        <span>
          A UI-only proposal by Claude. Served by the dev server, not part of the desktop build.
        </span>
        <a href="/preview">
          Compare with the current views <ArrowUpRight size={14} />
        </a>
      </footer>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Page />
  </StrictMode>,
);
