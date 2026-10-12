import { forwardRef, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useIsPresent } from 'motion/react';
import { ArrowUpRight, ChartColumn, ChevronRight, ChevronUp, Settings2, X } from 'lucide-react';
import { Eyes, HelloCharacter, type Tone, type Mood } from './Character';
import { SurfaceInk as Ink, SideSlot } from './IslandSurface';
import Ticker from './LiveText';
import useReducedMotion from './useReducedMotion';
import { Logo, IconButton, Meter } from './island-components';
import {
  ago,
  byProject,
  isLive,
  nameOf,
  timeOf,
  lookOf,
  plural,
  limitName,
  type Group,
  type NotchView,
} from './session-presentation';
import { PROVIDERS } from './types';
import { compactNumber, totalTokens } from './format';
export function Compact({
  view,
  paused,
  now,
  onOpen,
  onRun,
  count,
  inboxHidden,
  onInboxHiddenChange,
}: {
  view: NotchView;
  count: number;
  paused: boolean;
  now: number;
  onOpen?: (id?: string) => void;
  onRun?: (px: number) => void;
  inboxHidden: boolean;
  onInboxHiddenChange: (hidden: boolean) => void;
}) {
  const ink = useContext(Ink);
  const reduced = useReducedMotion();
  const opener = useRef<HTMLButtonElement>(null);
  const showNotices = useRef<HTMLButtonElement>(null);
  const top = paused ? undefined : view.current;
  const s = top?.session;
  const tone: Tone = !top ? 'calm' : top.look.tone;
  const mood: Mood = paused ? 'closed' : top ? top.look.mood : 'open';
  const title = paused ? 'Monitoring paused' : top ? nameOf(top) : 'No agents running';
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
  const agents = count;
  return (
    <div className="compact-wrap">
      <button
        ref={opener}
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
      {inboxHidden && inbox.length > 0 && (
        <motion.button
          ref={showNotices}
          className="inbox-show"
          aria-label="Show notices"
          aria-expanded={false}
          title={plural(inbox.length, 'hidden notice')}
          style={{ opacity: ink?.settle ?? 1 }}
          onClick={(event) => {
            onInboxHiddenChange(false);
            if (event.detail === 0) opener.current?.focus();
          }}
        >
          Show
        </motion.button>
      )}
      {/* Keep hiding separate from acknowledging or resolving a session. */}
      <AnimatePresence initial={false} mode="popLayout">
        {!inboxHidden && inbox.length > 0 && (
          <Inbox
            key="notices"
            groups={inbox}
            now={now}
            reduced={reduced}
            onOpen={onOpen}
            onHide={(keyboard) => {
              onInboxHiddenChange(true);
              if (keyboard) requestAnimationFrame(() => showNotices.current?.focus());
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

const Inbox = forwardRef<
  HTMLUListElement,
  {
    groups: Group[];
    now: number;
    reduced: boolean;
    onOpen?: (id?: string) => void;
    onHide: (keyboard: boolean) => void;
  }
>(function Inbox({ groups, now, reduced, onOpen, onHide }, ref) {
  const present = useIsPresent();
  return (
    <motion.ul
      ref={ref}
      className="inbox"
      aria-label="Waiting for you"
      aria-hidden={!present || undefined}
      inert={!present}
      initial={{ opacity: 0, y: reduced ? 0 : -6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: reduced ? 0 : -6 }}
      transition={{ duration: reduced ? 0 : 0.16, ease: [0.23, 1, 0.32, 1] }}
    >
      <AnimatePresence initial={false}>
        {groups.slice(0, 3).map((g) => (
          <motion.li
            key={g.session.id}
            initial={{ opacity: 0, y: reduced ? 0 : -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: reduced ? 0 : -6 }}
            // Rows land once the island has had a moment to make room for them.
            transition={{
              duration: reduced ? 0 : 0.32,
              delay: reduced ? 0 : 0.18,
              ease: [0.23, 1, 0.32, 1],
            }}
          >
            <button
              className={`inbox-row tone-${g.look.tone}`}
              onClick={() => onOpen?.(g.session.id)}
              aria-label={`${nameOf(g)}: ${g.look.label}. Open.`}
            >
              <i className="dot" aria-hidden="true" />
              <span className="inbox-name">{nameOf(g)}</span>
              <span className="state-text">{g.look.label}</span>
              <span className="inbox-time num">{timeOf(g.session, now)}</span>
            </button>
          </motion.li>
        ))}
      </AnimatePresence>
      <li className="inbox-actions">
        {groups.length > 3 && (
          <button className="inbox-more" onClick={() => onOpen?.(groups[3].session.id)}>
            {groups.length - 3} more
          </button>
        )}
        <button
          className="inbox-hide"
          aria-label="Hide notices"
          onClick={(event) => onHide(event.detail === 0)}
        >
          Hide
        </button>
      </li>
    </motion.ul>
  );
});

/* ------------------------------------------------------------------ */
/* Glance: one agent in depth, every other agent one row each          */
/* ------------------------------------------------------------------ */

function Hero({
  group,
  now,
  onDetails,
  onShow,
}: {
  group: Group;
  now: number;
  onDetails?: () => void;
  onShow?: () => void;
}) {
  const { session: s, look, children } = group;
  const finished = children.filter((child) => child.activity === 'finished').length;
  // Cancelled subagents never report their end: they go stale and stay that way.
  const quiet = children.filter((child) => child.activity === 'stale').length;
  const current = s.tasks.find((task) => task.status === 'in_progress');
  const done = s.tasks.filter((task) => task.status === 'completed').length;
  const step = current ? s.tasks.indexOf(current) + 1 : done;
  const nextLabel =
    current?.label ?? s.tasks.find((task) => task.status === 'pending')?.label ?? 'All steps done';
  const limits = s.limits.filter((item) => item.resetsAt > now);
  const slot = useContext(SideSlot);
  const said = s.activity !== 'working' && s.message;
  const saidVerb =
    look.label === 'Needs approval'
      ? 'wants to run'
      : look.label === 'Needs an answer'
        ? 'asks'
        : 'said';
  const [reading, setReading] = useState(false);
  // A new message, or another agent, starts with the panel closed.
  useEffect(() => setReading(false), [s.id, s.message]);
  const total = totalTokens(s.tokens);
  const agent = PROVIDERS[s.provider].short;
  const hint =
    s.activity === 'waiting'
      ? `Respond in ${agent} to keep it going.`
      : s.activity === 'error'
        ? `Open the ${agent} session to see what failed.`
        : null;
  return (
    <section className={`hero tone-${look.tone}`} aria-label={`${nameOf(group)}: ${look.label}`}>
      <div className="hero-head">
        <Logo provider={s.provider} size={20} />
        <h3 title={nameOf(group)}>{nameOf(group)}</h3>
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
        {/* What it said or asks, once it hands over; while it works, its step says more. All of
            it opens beside the island, so the island never grows taller for it. */}
        {said && (
          <button
            className="hero-said"
            aria-expanded={reading}
            aria-label={`Read what ${agent} ${saidVerb}`}
            onClick={() => setReading((open) => !open)}
          >
            <span>{s.message}</span>
          </button>
        )}
        {said &&
          reading &&
          slot &&
          createPortal(
            <aside
              className={`side-said tone-${look.tone}`}
              aria-label={`What ${agent} ${saidVerb}`}
            >
              <header>
                <span>
                  {agent} {saidVerb}
                </span>
                <IconButton label="Close" onClick={() => setReading(false)}>
                  <X size={14} />
                </IconButton>
              </header>
              <p>{s.message}</p>
            </aside>,
            slot,
          )}
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
          {limits.map((limit) => (
            <Meter
              key={limit.label}
              label={limitName(limit.label)}
              value={limit.usedPercent}
              note={`Resets in ${ago(limit.resetsAt - now)}`}
            />
          ))}
        </div>
        {children.length > 0 && (
          <div className="subs">
            <span className="subs-title">{plural(children.length, 'subagent')}</span>
            <ul>
              {/* Finished and quiet subagents pile up over a long session; each folds into one line. */}
              {children.filter(isLive).map((child) => {
                const childLook = lookOf(child, Infinity);
                return (
                  <li key={child.id} className={`tone-${childLook.tone}`}>
                    <i className="dot" />
                    <span>{child.detail}</span>
                    <span className="num">{timeOf(child, now)}</span>
                  </li>
                );
              })}
              {finished > 0 && (
                <li className="tone-done">
                  <i className="dot" />
                  <span>{finished} finished</span>
                </li>
              )}
              {quiet > 0 && (
                <li className="tone-off">
                  <i className="dot" />
                  <span>{quiet} quiet</span>
                </li>
              )}
            </ul>
          </div>
        )}
        <footer className="hero-foot">
          <span className="num">
            {total === null ? 'Tokens unavailable' : `${compactNumber(total)} tokens`} · {s.model}
          </span>
          <span className="hero-actions">
            {onShow && s.process && (
              <button className="link" onClick={onShow}>
                Go to {agent} <ArrowUpRight size={13} />
              </button>
            )}
            {onDetails && (
              <button className="link" onClick={onDetails}>
                Details <ChevronRight size={13} />
              </button>
            )}
          </span>
        </footer>
      </div>
    </section>
  );
}

function Empty() {
  return (
    <div className="empty">
      <HelloCharacter size={60} tone="calm" />
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
  onShow,
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
  onShow?: (id: string) => void;
  onUsage?: () => void;
  onSettings?: () => void;
  onCollapse?: () => void;
  onResume?: () => void;
}) {
  const focus = groups.find((g) => g.session.id === focusId) ?? groups[0];
  const others = groups.filter((g) => g !== focus);
  const projects = byProject(groups);
  const alone = (g: Group) => projects.some((p) => p.length === 1 && p[0] === g);
  const row = (g: Group, name: string) => (
    <li key={g.session.id}>
      <button
        className={`row tone-${g.look.tone}`}
        onClick={() => onFocus?.(g.session.id)}
        aria-label={`${nameOf(g)}: ${g.look.label}`}
      >
        <Logo provider={g.session.provider} size={16} />
        <span className="row-name">{name}</span>
        {g.children.some(isLive) && (
          <span className="row-badge num">+{g.children.filter(isLive).length}</span>
        )}
        <span className="row-state">
          <i className="dot" />
          {g.look.label}
        </span>
        <span className="row-time num">{timeOf(g.session, now)}</span>
      </button>
    </li>
  );
  const waiting = groups.filter((g) => g.look.tone === 'attention').length;
  const errors = groups.filter((g) => g.look.tone === 'error').length;
  return (
    <div className={`glance${paused ? ' is-paused' : ''}`}>
      <header className="bar">
        {/* The whole bar collapses for the pointer; the chevron is the keyboard stop. */}
        <button
          className="bar-toggle"
          aria-label="Collapse Glim"
          tabIndex={-1}
          onClick={onCollapse}
        />
        <p className="bar-title">
          <span>{groups.length ? plural(projects.length, 'project') : 'Glim'}</span>
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
            onShow={onShow && (() => onShow(focus.session.id))}
          />
        ) : (
          <Empty />
        )}
        {others.length > 0 && (
          <ul className="others">
            {/* One row per project; a project with several agents lists them under its name. */}
            {byProject(others).map((agents) =>
              agents.length === 1 && alone(agents[0]) ? (
                row(agents[0], agents[0].session.project)
              ) : (
                <li key={agents[0].session.project} className="project">
                  <span className="project-name">{agents[0].session.project}</span>
                  <ul>{agents.map((g) => row(g, g.agent))}</ul>
                </li>
              ),
            )}
          </ul>
        )}
      </div>
    </div>
  );
}
