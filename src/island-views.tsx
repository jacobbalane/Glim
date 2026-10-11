import { forwardRef, useContext, useRef, type ReactNode } from 'react';
import { AnimatePresence, motion, useIsPresent } from 'motion/react';
import { ChartColumn, ChevronRight, ChevronUp, Settings2 } from 'lucide-react';
import { Eyes, HelloCharacter, type Tone, type Mood } from './Character';
import { SurfaceInk as Ink } from './IslandSurface';
import Ticker from './LiveText';
import useReducedMotion from './useReducedMotion';
import { Logo, IconButton, Meter } from './island-components';
import {
  ago,
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

function Hero({ group, now, onDetails }: { group: Group; now: number; onDetails?: () => void }) {
  const { session: s, look, children } = group;
  const finished = children.filter((child) => child.activity === 'finished').length;
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
              {/* Finished subagents pile up over a long session; they fold into one line. */}
              {children
                .filter((child) => child.activity !== 'finished')
                .map((child) => {
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
        {/* The whole bar collapses for the pointer; the chevron is the keyboard stop. */}
        <button
          className="bar-toggle"
          aria-label="Collapse Glim"
          tabIndex={-1}
          onClick={onCollapse}
        />
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
