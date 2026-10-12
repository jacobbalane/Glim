// The site's reading pages: Docs and Changelog. Each has its own HTML file (docs/, changelog/)
// that names the page; this module draws it with the landing page's header, type and footer.
// The changelog is CHANGELOG.md from the repository, so GitHub and the site never disagree.
import { StrictMode, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/manrope';
import '@fontsource-variable/unbounded';
import '../preview-claude/style.css';
import '../src/styles.css';
import './site.css';
import changelog from '../CHANGELOG.md?raw';
import { Brand, DOWNLOAD, GetLinks, PageLinks, REPO, SiteFoot } from './chrome';

const ROOT = '../';

/* ------------------------------------------------------------------ */
/* Docs                                                                */
/* ------------------------------------------------------------------ */

const STATES: [tone: string, name: string, meaning: string][] = [
  ['active', 'Working', 'The agent is thinking or running a tool.'],
  [
    'attention',
    'Needs approval',
    'A tool call waits for your yes. Needs an answer: a question waits.',
  ],
  ['success', 'Your turn', 'The agent handed the turn back. It turns Ready once you have looked.'],
  ['calm', 'Ready', 'Nothing new since you last looked, or a session that has only just started.'],
  ['error', 'Error', 'The agent reported a failure. It stays until the agent moves on.'],
  ['calm', 'Interrupted', 'You stopped the turn, so there is nothing to chase.'],
  ['done', 'Done', 'The session ended, or its agent was closed. It leaves a few minutes later.'],
  ['off', 'Quiet', 'No activity for five minutes. Glim never guesses that a quiet agent is done.'],
];

const SECTIONS: [id: string, title: string, body: ReactNode][] = [
  [
    'install',
    'Install',
    <>
      <p>
        Glim runs on Windows 11, 64-bit. It installs for your account only, so it needs no
        administrator rights, and Setup brings WebView2 along if Windows lacks it.
      </p>
      <ol>
        <li>
          Download <code>Glim_x.y.z_x64-setup.exe</code> from{' '}
          <a href={DOWNLOAD} target="_blank" rel="noreferrer">
            the latest release
          </a>
          .
        </li>
        <li>
          Run it. The installer is not code-signed yet, so Windows SmartScreen may warn about a new
          app: choose <b>More info</b>, then <b>Run anyway</b>.
        </li>
        <li>Open Glim from the Start menu. It asks to connect your agents first.</li>
      </ol>
      <p>
        Each release lists a SHA-256 checksum for its installer, and GitHub records where the
        installer was built. To check that a download is the one the release workflow made:
      </p>
      <pre>
        <code>gh attestation verify Glim_x.y.z_x64-setup.exe --repo jacobbalane/Glim</code>
      </pre>
    </>,
  ],
  [
    'connect',
    'Connect your agents',
    <>
      <p>
        Pick Claude Code, Codex or both. Before it changes anything, Glim shows the entries it will
        add, and it keeps a backup of every file it touches.
      </p>
      <ul>
        <li>
          <b>Claude Code:</b> hooks and a status line in <code>~/.claude/settings.json</code>, or in
          <code>CLAUDE_CONFIG_DIR</code> when you set it. Your own status line keeps working: Glim
          passes it through.
        </li>
        <li>
          <b>Codex:</b> hooks in <code>~/.codex/hooks.json</code>, or under <code>CODEX_HOME</code>.
          Then open <code>/hooks</code> in Codex and trust the Glim hooks. Glim never skips a
          provider's trust check.
        </li>
      </ul>
      <p>
        Start a new agent session as usual; no Glim account or API key is needed. To undo it, turn
        the agent off under <b>Agents</b> in Settings, and Glim puts your configuration back.
      </p>
    </>,
  ],
  [
    'island',
    'Read the island',
    <>
      <p>
        The island hangs from the top of your screen. Its color is the state of the agent it shows:
      </p>
      <dl className="site-doc-states">
        {STATES.map(([tone, name, meaning]) => (
          <div key={name} className={`tone-${tone}`}>
            <dt>
              <i className="dot" />
              {name}
            </dt>
            <dd>{meaning}</dd>
          </div>
        ))}
      </dl>
      <p>
        With several agents, the working ones take turns in the island. An approval, a question, a
        finished turn or an error interrupts once, then waits in the banner below the island until
        you deal with it.
      </p>
      <p>
        Click the island to open it. The agent you picked shows its current step, context use,
        account limits when Claude Code reports them, and its subagents. When it hands over, you see
        what it said, asks or wants to run, and <b>Go to Claude</b> brings its terminal or editor
        window to the front. Every other project gets one row, with its agents under it when it has
        several, named like "Glim · Codex". Click its header, click outside it or press{' '}
        <kbd>Esc</kbd> to close it.
      </p>
    </>,
  ],
  [
    'settings',
    'Settings',
    <>
      <p>Open Settings with the gear in the open island, or from Glim's icon in the system tray.</p>
      <ul>
        <li>
          <b>Agents:</b> connect or disconnect Claude Code and Codex.
        </li>
        <li>
          <b>Island:</b> keep a small pill visible when nothing is running, or hide it; pick the
          display; start with Windows; hide over fullscreen apps; pause monitoring.
        </li>
        <li>
          <b>Data:</b> view usage by day and by project for the last 30 days, or clear it.
        </li>
        <li>
          <b>Updates:</b> check for a new version and install it.
        </li>
      </ul>
      <p>
        The tray menu has the same shortcuts: Show island, Settings, Usage history, Pause or resume
        monitoring, and Quit Glim. Glim has to keep running to see your agents.
      </p>
    </>,
  ],
  [
    'updates',
    'Updates',
    <>
      <p>
        In Settings, under <b>Updates</b>, click <b>Check</b>. When a newer version exists, click{' '}
        <b>Update</b>: Glim downloads it, checks its signature against the key built into Glim,
        installs it in place and opens again. Your agents and history stay as they were.
      </p>
      <p>
        Updating from Settings works from version 0.1.2 on. Before that, download the new installer
        and run it over the old one. See <a href={`${ROOT}changelog/`}>what changed</a>.
      </p>
    </>,
  ],
  [
    'privacy',
    'Privacy',
    <>
      <p>
        Glim works on your PC. There is no account, no telemetry and no cloud sync. It goes online
        only when you click <b>Check</b> under Updates, to ask GitHub for the latest release.
      </p>
      <ul>
        <li>
          <b>Kept, for 30 days:</b> token counts, usage by day, agent, model and project names, task
          labels and session state, in <code>%LOCALAPPDATA%\Glim\usage.sqlite3</code>.
        </li>
        <li>
          <b>Never kept:</b> prompts, responses, tool input or output, and credentials. Glim reads
          agent transcripts in memory to count usage and leaves them as they are.
        </li>
        <li>
          <b>Shown, never kept:</b> while a session is open, the island previews the agent's latest
          words: its last message, its question or the command it asks to run. It lives in memory
          and is gone when the session ends or Glim quits.
        </li>
      </ul>
      <p>
        The backups of your agent configuration sit in <code>%LOCALAPPDATA%\Glim</code>. They can
        hold values you already saved in that configuration, so treat them as private.
      </p>
    </>,
  ],
  [
    'compatibility',
    'Compatibility',
    <>
      <p>
        Glim follows Claude Code and Codex CLI in native Windows terminals, including the terminal
        in your IDE. WSL, IDE extensions, desktop agent apps and remote sessions are not supported
        yet.
      </p>
      <div className="site-doc-table">
        <table>
          <thead>
            <tr>
              <th scope="col" />
              <th scope="col">Claude Code</th>
              <th scope="col">Codex CLI</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <th scope="row">Activity and approvals</th>
              <td>Yes</td>
              <td>Yes</td>
            </tr>
            <tr>
              <th scope="row">Token usage</th>
              <td>Yes</td>
              <td>Yes</td>
            </tr>
            <tr>
              <th scope="row">Context use</th>
              <td>Yes</td>
              <td>Estimated</td>
            </tr>
            <tr>
              <th scope="row">Task steps</th>
              <td>Yes</td>
              <td>Yes</td>
            </tr>
            <tr>
              <th scope="row">Account limits</th>
              <td>When reported</td>
              <td>Not yet</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p>
        Tested with Claude Code 2.1.289 and Codex CLI 0.161.0.{' '}
        <a href={`${REPO}/blob/main/docs/compatibility.md`} target="_blank" rel="noreferrer">
          What each number means
        </a>
        .
      </p>
    </>,
  ],
  [
    'troubleshooting',
    'Troubleshooting',
    <>
      <h3>The island shows no agents</h3>
      <ul>
        <li>Check that Glim is running: its icon sits in the system tray.</li>
        <li>Check that monitoring is not paused, and that the agent is on under Agents.</li>
        <li>Start a new agent session. Sessions opened before you connected may not report.</li>
        <li>
          For Codex, trust the Glim hooks in <code>/hooks</code>.
        </li>
        <li>
          Project settings or managed policies can turn off user hooks. Glim does not change them.
        </li>
      </ul>
      <h3>An agent says Quiet</h3>
      <p>
        It sent nothing for five minutes, often because a long command is running. It wakes with its
        next event.
      </p>
      <h3>Token counts say unavailable</h3>
      <p>
        Some sessions report activity but have no transcript Glim can read. Activity still shows;
        the counts stay empty rather than guessed.
      </p>
      <h3>Still stuck</h3>
      <p>
        <a href={`${REPO}/issues`} target="_blank" rel="noreferrer">
          Open an issue
        </a>{' '}
        with your Glim and Windows versions. Never attach prompts, credentials or transcripts.
      </p>
    </>,
  ],
  [
    'uninstall',
    'Uninstall',
    <>
      <p>
        Open Windows Settings, then <b>Apps</b>, <b>Installed apps</b>, and uninstall Glim. It
        removes its hooks, restores your agent configuration and takes itself out of startup.
      </p>
      <p>
        Your usage history stays unless you tick <b>Also delete my usage history</b> while
        uninstalling, or clear it in Settings first.
      </p>
    </>,
  ],
  [
    'develop',
    'Build it yourself',
    <>
      <p>Glim is MIT licensed. The repository has everything to build, test and change it:</p>
      <ul>
        <li>
          <a href={`${REPO}/blob/main/docs/development.md`} target="_blank" rel="noreferrer">
            Development
          </a>
          : commands, checks and packaging.
        </li>
        <li>
          <a href={`${REPO}/blob/main/docs/architecture.md`} target="_blank" rel="noreferrer">
            Architecture
          </a>
          : how events travel from an agent to the island.
        </li>
        <li>
          <a href={`${REPO}/blob/main/CONTRIBUTING.md`} target="_blank" rel="noreferrer">
            Contributing
          </a>{' '}
          and{' '}
          <a href={`${REPO}/blob/main/SECURITY.md`} target="_blank" rel="noreferrer">
            reporting a security issue
          </a>
          .
        </li>
      </ul>
    </>,
  ],
];

function Docs() {
  return (
    <>
      <header className="site-doc-head">
        <h1>How Glim works</h1>
        <p className="site-lede">
          Install it, connect your agents and read the island at a glance. Everything Glim keeps
          stays on your PC.
        </p>
      </header>
      <div className="site-doc-grid">
        <nav className="site-doc-toc" aria-label="On this page">
          <b>On this page</b>
          {SECTIONS.map(([id, title]) => (
            <a key={id} href={`#${id}`}>
              {title}
            </a>
          ))}
        </nav>
        <div className="site-doc-body">
          {SECTIONS.map(([id, title, body]) => (
            <section key={id} id={id} aria-labelledby={`${id}-title`}>
              <h2 id={`${id}-title`}>{title}</h2>
              {body}
            </section>
          ))}
        </div>
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Changelog: CHANGELOG.md, read the way it is written                 */
/* ------------------------------------------------------------------ */

// ponytail: only the Markdown CHANGELOG.md uses: headings, bullets, paragraphs, **bold**, `code`
// and [links]. Reach for a Markdown parser if the file outgrows that.
function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g).map((part, i) => {
    if (part.startsWith('**')) return <b key={i}>{part.slice(2, -2)}</b>;
    if (part.startsWith('`')) return <code key={i}>{part.slice(1, -1)}</code>;
    const link = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (link)
      return (
        <a key={i} href={link[2]} target="_blank" rel="noreferrer">
          {link[1]}
        </a>
      );
    return part;
  });
}

interface Release {
  version: string;
  date?: string;
  blocks: ReactNode[];
}

function parseChangelog(markdown: string) {
  const releases: Release[] = [];
  const intro: ReactNode[] = [];
  let list: string[] = [];
  const blocks = () => releases.at(-1)?.blocks ?? intro;
  const flush = () => {
    if (list.length)
      blocks().push(
        <ul key={blocks().length}>
          {list.map((item, i) => (
            <li key={i}>{inline(item)}</li>
          ))}
        </ul>,
      );
    list = [];
  };
  for (const line of markdown.split(/\r?\n/)) {
    const release = line.match(/^## (.+?)(?: \((\d{4}-\d{2}-\d{2})\))?$/);
    if (line.startsWith('# ')) continue;
    if (release) {
      flush();
      releases.push({ version: release[1], date: release[2], blocks: [] });
    } else if (line.startsWith('### ')) {
      flush();
      blocks().push(<h3 key={blocks().length}>{line.slice(4)}</h3>);
    } else if (line.startsWith('- ')) list.push(line.slice(2));
    else if (line.trim()) {
      flush();
      blocks().push(<p key={blocks().length}>{inline(line)}</p>);
    }
  }
  flush();
  return { intro, releases };
}

function Changelog() {
  const { intro, releases } = parseChangelog(changelog);
  return (
    <div className="site-log">
      <header className="site-doc-head">
        <h1>Changelog</h1>
        <div className="site-lede">{intro}</div>
      </header>
      {releases.map((release) => {
        const next = release.version === 'Unreleased';
        const date =
          release.date &&
          new Date(`${release.date}T12:00:00Z`).toLocaleDateString('en', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          });
        return (
          <article
            key={release.version}
            id={next ? 'next' : `v${release.version}`}
            className={`site-log-release${next ? ' is-next' : ''}`}
            aria-labelledby={`${release.version}-title`}
          >
            <div className="site-log-meta">
              <h2 id={`${release.version}-title`}>{next ? 'Coming next' : release.version}</h2>
              {date && <time dateTime={release.date}>{date}</time>}
            </div>
            <div className="site-log-body">{release.blocks}</div>
          </article>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */

function Page({ page }: { page: 'docs' | 'changelog' }) {
  return (
    <div className="site site-doc" id="top">
      <header className="site-top is-scrolled">
        <div className="site-pill site-pages">
          <Brand root={ROOT} />
          <PageLinks root={ROOT} current={page} />
        </div>
        <nav className="site-pill site-nav" aria-label="Glim">
          <GetLinks />
        </nav>
      </header>
      <main className="site-doc-main">{page === 'docs' ? <Docs /> : <Changelog />}</main>
      <SiteFoot root={ROOT} />
    </div>
  );
}

const root = document.getElementById('root')!;
createRoot(root).render(
  <StrictMode>
    <Page page={root.dataset.page === 'changelog' ? 'changelog' : 'docs'} />
  </StrictMode>,
);
