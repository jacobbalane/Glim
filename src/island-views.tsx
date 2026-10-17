import {
  forwardRef,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useIsPresent } from 'motion/react';
import {
  ArrowUpRight,
  ChartColumn,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  ListCollapse,
  Settings2,
  X,
} from 'lucide-react';
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
import { PROVIDERS, type Session } from './types';
import { compactNumber, totalTokens } from './format';
export function Compact({
  view,
  paused,
  now,
  onOpen,
  onRun,
  count,
  folded,
  onFoldedChange,
}: {
  view: NotchView;
  count: number;
  paused: boolean;
  now: number;
  onOpen?: (id?: string, picked?: boolean) => void;
  onRun?: (px: number) => void;
  // Notices waiting under the island fold into a strip of colored dots.
  folded: boolean;
  onFoldedChange: (folded: boolean) => void;
}) {
  const ink = useContext(Ink);
  const reduced = useReducedMotion();
  const opener = useRef<HTMLButtonElement>(null);
  const showNotices = useRef<HTMLButtonElement>(null);
  const notices = useRef<HTMLUListElement>(null);
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
        data-island-drag
        data-island-options
        aria-description="Click to open. Hold to move horizontally. Use Alt and the arrow keys to move, or Shift and F10 for options."
        onClick={() => onOpen?.(s?.id)}
        data-session-id={s?.id}
        aria-expanded={false}
        aria-label={`Glim: ${title}${status ? `, ${status}` : ''}. ${plural(agents, 'agent')}. Open.`}
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
      {/* Keep folding separate from acknowledging or resolving a session. Between the list and
          the strip, each agent's dot travels to its new place while the island changes height. */}
      <AnimatePresence initial={false} mode="popLayout">
        {inbox.length > 0 &&
          (folded ? (
            <NoticeStrip
              key="strip"
              ref={showNotices}
              groups={inbox}
              reduced={reduced}
              onShow={(keyboard) => {
                onFoldedChange(false);
                if (keyboard)
                  requestAnimationFrame(() =>
                    notices.current?.querySelector<HTMLButtonElement>('.inbox-row')?.focus(),
                  );
              }}
            />
          ) : (
            <Inbox
              key="notices"
              ref={notices}
              groups={inbox}
              now={now}
              reduced={reduced}
              onOpen={onOpen}
              onHide={(keyboard) => {
                onFoldedChange(true);
                if (keyboard) requestAnimationFrame(() => showNotices.current?.focus());
              }}
            />
          ))}
      </AnimatePresence>
    </div>
  );
}

// Words in the list and the strip arrive just after the dots start moving, and leave quickly.
const EASE_OUT = [0.23, 1, 0.32, 1] as const;
const textIn = (reduced: boolean, delay = 0.1) => ({
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
  transition: { duration: reduced ? 0 : 0.24, delay: reduced ? 0 : delay, ease: EASE_OUT },
});

// How the dots of waiting agents travel between the list and the strip.
const DOT_LAYOUT = { type: 'spring' as const, stiffness: 420, damping: 40, mass: 1 };
const STRIP_DOTS = 6;

// The folded notices: one dot per waiting agent in its state's color, then how many there are.
const NoticeStrip = forwardRef<
  HTMLButtonElement,
  { groups: Group[]; reduced: boolean; onShow: (keyboard: boolean) => void }
>(function NoticeStrip({ groups, reduced, onShow }, ref) {
  const present = useIsPresent();
  const labels = new Map<string, number>();
  for (const g of groups) labels.set(g.look.label, (labels.get(g.look.label) ?? 0) + 1);
  const summary = [...labels].map(([label, n]) => `${n} ${label}`).join(', ');
  return (
    <motion.button
      ref={ref}
      className="inbox-strip"
      aria-label={`${summary}. Show notices.`}
      aria-expanded={false}
      aria-hidden={!present || undefined}
      inert={!present}
      onClick={(event) => onShow(event.detail === 0)}
      initial={false}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: reduced ? 0 : 0.14, ease: EASE_OUT } }}
    >
      <span className="inbox-strip-dots" aria-hidden="true">
        {groups.slice(0, STRIP_DOTS).map((g) => (
          <motion.i
            key={g.session.id}
            layoutId={reduced ? undefined : `notice-dot-${g.session.id}`}
            transition={DOT_LAYOUT}
            className={`dot tone-${g.look.tone}`}
          />
        ))}
        {groups.length > STRIP_DOTS && (
          <motion.span className="num" {...textIn(reduced)}>
            +{groups.length - STRIP_DOTS}
          </motion.span>
        )}
      </span>
      <motion.span className="inbox-strip-count num" aria-hidden="true" {...textIn(reduced)}>
        {groups.length} waiting
        <ChevronDown size={12} strokeWidth={2.4} />
      </motion.span>
    </motion.button>
  );
});

// The notices as a list under the island, one row per agent. Its dots stay solid while the
// rest of it fades, so they can travel to and from the strip.
const Inbox = forwardRef<
  HTMLUListElement,
  {
    groups: Group[];
    now: number;
    reduced: boolean;
    onOpen?: (id?: string, picked?: boolean) => void;
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
      initial={false}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: reduced ? 0 : 0.14, ease: EASE_OUT } }}
    >
      <AnimatePresence>
        {groups.slice(0, 3).map((g, index) => (
          <motion.li
            key={g.session.id}
            // A row that arrives while the list is open slides in under the ones above it.
            initial={{ y: reduced ? 0 : -8 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: reduced ? 0 : 0.14 } }}
            transition={{ duration: reduced ? 0 : 0.32, ease: EASE_OUT }}
          >
            <button
              className={`inbox-row tone-${g.look.tone}`}
              onClick={() => onOpen?.(g.session.id, true)}
              aria-label={`${nameOf(g)}: ${g.look.label}. Open.`}
            >
              <motion.i
                layoutId={reduced ? undefined : `notice-dot-${g.session.id}`}
                transition={DOT_LAYOUT}
                className="dot"
                aria-hidden="true"
              />
              <motion.span className="inbox-name" {...textIn(reduced, 0.08 + index * 0.04)}>
                {nameOf(g)}
              </motion.span>
              <motion.span className="state-text" {...textIn(reduced, 0.08 + index * 0.04)}>
                {g.look.label}
              </motion.span>
              <motion.span className="inbox-time num" {...textIn(reduced, 0.08 + index * 0.04)}>
                {timeOf(g.session, now)}
              </motion.span>
            </button>
          </motion.li>
        ))}
      </AnimatePresence>
      <motion.li className="inbox-actions" {...textIn(reduced, 0.2)}>
        {groups.length > 3 && (
          <button className="inbox-more" onClick={() => onOpen?.(groups[3].session.id, true)}>
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
      </motion.li>
    </motion.ul>
  );
});

/* ------------------------------------------------------------------ */
/* Glance: one agent in depth, every other agent one row each          */
/* ------------------------------------------------------------------ */

// The message panel clipped to its top edge, and fully shown. Clipping, not scaling, uncovers the
// text in place instead of stretching it.
const rolledUp = 'inset(0 0 100% 0 round 14px)';
const unrolled = 'inset(0 0 0% 0 round 14px)';

// An agent's whole message, beside the open island. It slides out of the island's side as it
// unrolls from its top edge, its words following a beat later; it rolls back up faster than it
// came. A long message scrolls, with a thin scrollbar always shown and its edges fading wherever
// there is more to read. Escape closes it before it closes the island.
function SaidPanel({
  tone,
  title,
  message,
  reduced,
  fromLeft,
  onClose,
}: {
  tone: Tone;
  title: string;
  message: string;
  reduced: boolean;
  fromLeft: boolean;
  onClose: () => void;
}) {
  const body = useRef<HTMLDivElement>(null);
  // Whether there is more above or below, and the scroll thumb's size and place, as fractions.
  const [more, setMore] = useState({ above: false, below: false, size: 1, at: 0 });
  const close = useRef(onClose);
  close.current = onClose;
  useLayoutEffect(() => {
    const el = body.current;
    if (!el) return;
    const update = () => {
      const range = el.scrollHeight - el.clientHeight;
      setMore({
        above: el.scrollTop > 1,
        below: el.scrollTop < range - 1,
        size: el.scrollHeight > 0 ? el.clientHeight / el.scrollHeight : 1,
        at: range > 0 ? el.scrollTop / range : 0,
      });
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    // The text itself too: it can reflow, as when its font arrives, without the panel resizing.
    if (el.firstElementChild) observer.observe(el.firstElementChild);
    el.addEventListener('scroll', update, { passive: true });
    return () => {
      observer.disconnect();
      el.removeEventListener('scroll', update);
    };
  }, [message]);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      close.current();
    };
    window.addEventListener('keydown', key, true);
    return () => window.removeEventListener('keydown', key, true);
  }, []);
  // Dragging the thumb scrolls the message by as much as the thumb moves along its track.
  const drag = (event: ReactPointerEvent<HTMLElement>) => {
    const el = body.current;
    const thumb = event.currentTarget;
    const track = thumb.parentElement;
    if (!el || !track || event.button !== 0) return;
    event.preventDefault();
    const start = { y: event.clientY, top: el.scrollTop };
    const scale =
      (el.scrollHeight - el.clientHeight) / Math.max(1, track.clientHeight - thumb.offsetHeight);
    thumb.setPointerCapture(event.pointerId);
    const move = (e: PointerEvent) => {
      el.scrollTop = start.top + (e.clientY - start.y) * scale;
    };
    const end = () => {
      thumb.removeEventListener('pointermove', move);
      thumb.removeEventListener('pointerup', end);
      thumb.removeEventListener('pointercancel', end);
    };
    thumb.addEventListener('pointermove', move);
    thumb.addEventListener('pointerup', end);
    thumb.addEventListener('pointercancel', end);
  };
  const scrolls = more.above || more.below;
  const offset = reduced ? 0 : fromLeft ? 12 : -12;
  return (
    <motion.aside
      className={`side-said tone-${tone}`}
      aria-label={`What ${title}`}
      initial={{ clipPath: rolledUp, x: offset }}
      animate={{ clipPath: unrolled, x: 0 }}
      exit={{
        clipPath: rolledUp,
        x: offset,
        transition: { duration: reduced ? 0 : 0.2, ease: EASE_OUT },
      }}
      transition={{
        clipPath: { duration: reduced ? 0 : 0.36, ease: EASE_OUT },
        x: reduced ? { duration: 0 } : DOT_LAYOUT,
      }}
    >
      <motion.header {...textIn(reduced, 0.06)}>
        <span>{title}</span>
        <IconButton label="Close" onClick={onClose}>
          <X size={14} />
        </IconButton>
      </motion.header>
      <motion.div
        ref={body}
        className="side-said-body"
        data-more-above={more.above}
        data-more-below={more.below}
        // A message longer than the panel can be scrolled from the keyboard too.
        tabIndex={scrolls ? 0 : undefined}
        {...textIn(reduced, 0.12)}
      >
        <p>{message}</p>
      </motion.div>
      {/* The panel's own scrollbar, always shown while there is more to read: system scrollbars
          hide until hovered on Windows 11 and macOS. */}
      <AnimatePresence>
        {scrolls && (
          <motion.div className="side-said-track" aria-hidden="true" {...textIn(reduced, 0.16)}>
            <i
              style={{ height: `${more.size * 100}%`, top: `${more.at * (1 - more.size) * 100}%` }}
              onPointerDown={drag}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </motion.aside>
  );
}

// When a usage limit stops an agent: when the full limit resets, if it reported that, and what
// to do then.
function limitHint(s: Session, agent: string, now: number) {
  const full = s.limits.find((limit) => limit.usedPercent >= 100 && limit.resetsAt > now);
  return full
    ? `${limitName(full.label)} resets in ${ago(full.resetsAt - now)}. Continue in ${agent} then.`
    : `Continue in ${agent} once the limit resets.`;
}

function Hero({
  group,
  now,
  onDetails,
  onShow,
  onFold,
}: {
  group: Group;
  now: number;
  onDetails?: () => void;
  onShow?: () => void;
  onFold?: () => void;
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
  const preview = useRef<HTMLButtonElement>(null);
  const reduced = useReducedMotion();
  // A new message, or another agent, starts with the panel closed.
  useEffect(() => setReading(false), [s.id, s.message]);
  const total = totalTokens(s.tokens);
  const agent = PROVIDERS[s.provider].short;
  const hint =
    s.activity === 'waiting'
      ? `Respond in ${agent} to keep it going.`
      : s.activity === 'error'
        ? `Open the ${agent} session to see what failed.`
        : s.activity === 'limited'
          ? limitHint(s, agent, now)
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
        {onFold && (
          <IconButton label="Show as a list" onClick={onFold}>
            <ListCollapse size={15} />
          </IconButton>
        )}
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
            ref={preview}
            className="hero-said"
            aria-expanded={reading}
            aria-label={`Read what ${agent} ${saidVerb}`}
            onClick={() => setReading((open) => !open)}
          >
            <span>{s.message}</span>
          </button>
        )}
        {slot &&
          createPortal(
            <AnimatePresence>
              {said && reading && (
                <SaidPanel
                  key="said"
                  tone={look.tone}
                  title={`${agent} ${saidVerb}`}
                  message={s.message ?? ''}
                  reduced={reduced}
                  fromLeft={slot.classList.contains('on-left')}
                  onClose={() => {
                    setReading(false);
                    preview.current?.focus({ preventScroll: true });
                  }}
                />
              )}
            </AnimatePresence>,
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

// What is under the bar, arriving over the time the island takes to resize; the view leaving goes
// quickly and can no longer be reached.
const Crossfade = forwardRef<HTMLDivElement, { reduced: boolean; children: ReactNode }>(
  function Crossfade({ reduced, children }, ref) {
    const present = useIsPresent();
    const ease = [0.23, 1, 0.32, 1] as const;
    return (
      <motion.div
        ref={ref}
        inert={!present}
        aria-hidden={!present || undefined}
        initial={{ opacity: 0, filter: reduced ? 'none' : 'blur(3px)' }}
        animate={{
          opacity: 1,
          filter: reduced ? 'none' : 'blur(0px)',
          transition: { duration: reduced ? 0.06 : 0.32, ease },
        }}
        exit={{
          opacity: 0,
          filter: reduced ? 'none' : 'blur(3px)',
          transition: { duration: reduced ? 0.06 : 0.18, ease },
        }}
      >
        {children}
      </motion.div>
    );
  },
);

export function Glance({
  groups,
  focusId = null,
  listed = false,
  now,
  paused,
  onList,
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
  // Every agent as a row, none shown in full.
  listed?: boolean;
  now: number;
  paused: boolean;
  onList?: (listed: boolean) => void;
  onFocus?: (id: string) => void;
  onDetails?: (id: string) => void;
  onShow?: (id: string) => void;
  onUsage?: () => void;
  onSettings?: () => void;
  onCollapse?: () => void;
  onResume?: () => void;
}) {
  const focus = listed ? undefined : (groups.find((g) => g.session.id === focusId) ?? groups[0]);
  const reduced = useReducedMotion();
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
  const limited = groups.filter((g) => g.look.tone === 'limit').length;
  return (
    <div className={`glance${paused ? ' is-paused' : ''}`}>
      <header className="bar">
        {/* The whole bar collapses for the pointer; the chevron is the keyboard stop. */}
        <button
          className="bar-toggle"
          data-island-drag
          aria-description="Click to collapse. Hold to move horizontally."
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
          {limited > 0 && <span className="tone-limit state-text">{limited} at limit</span>}
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
        {/* Folding into the list or picking an agent changes only what is under the bar: it
            crossfades, arriving over the time the island takes to resize, while the bar stays. */}
        <AnimatePresence initial={false} mode="popLayout">
          <Crossfade key={focus ? focus.session.id : 'list'} reduced={reduced}>
            {focus ? (
              <Hero
                group={focus}
                now={now}
                onDetails={onDetails && (() => onDetails(focus.session.id))}
                onShow={onShow && (() => onShow(focus.session.id))}
                onFold={onList && (() => onList(true))}
              />
            ) : (
              groups.length === 0 && <Empty />
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
          </Crossfade>
        </AnimatePresence>
      </div>
    </div>
  );
}
