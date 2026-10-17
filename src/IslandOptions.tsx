import { useEffect, useRef, useState } from 'react';
import { motion, useIsPresent } from 'motion/react';
import type { QuickAction } from './quick-options';

export default function IslandOptions({
  id,
  reduced,
  left,
  actions,
  onClose,
  onError,
}: {
  id: string;
  reduced: boolean;
  left: boolean;
  actions: QuickAction[];
  onClose: () => void;
  onError: (error: string) => void;
}) {
  const first = useRef<HTMLButtonElement>(null);
  const pending = useRef(false);
  const [busy, setBusy] = useState(false);
  const present = useIsPresent();
  useEffect(() => {
    if (present) first.current?.focus({ preventScroll: true });
  }, [present]);
  const act = async (action: () => Promise<void>) => {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    try {
      await action();
      onClose();
    } catch (error) {
      onError(String(error));
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };
  return (
    <motion.div
      id={id}
      className="island-options-menu"
      role="menu"
      aria-label="Glim options"
      aria-orientation="horizontal"
      aria-busy={busy || undefined}
      inert={!present}
      aria-hidden={!present || undefined}
      style={{ pointerEvents: present ? 'auto' : 'none' }}
      // The icons follow the pill's edge out, one after another, and leave together.
      initial="hidden"
      animate="shown"
      exit="gone"
      variants={{
        hidden: {},
        shown: {
          transition: {
            staggerChildren: reduced ? 0 : 0.03,
            // Nearest the button first, on either side of it.
            staggerDirection: left ? -1 : 1,
            delayChildren: 0.02,
          },
        },
        gone: { opacity: 0, transition: { duration: reduced ? 0.06 : 0.1 } },
      }}
      onKeyDown={(event) => {
        if (!['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key))
          return;
        event.preventDefault();
        const items = Array.from(
          event.currentTarget.querySelectorAll<HTMLButtonElement>(
            '[role="menuitem"]:not(:disabled)',
          ),
        );
        if (!items.length) return;
        const current = items.indexOf(document.activeElement as HTMLButtonElement);
        const next =
          event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? items.length - 1
              : (current +
                  (['ArrowDown', 'ArrowRight'].includes(event.key) ? 1 : -1) +
                  items.length) %
                items.length;
        items[next].focus();
      }}
    >
      {actions.map(({ id, label, Icon, run }, index) => (
        <motion.button
          key={id}
          ref={index === actions.findIndex((action) => !!action.run) ? first : undefined}
          className="island-action"
          role="menuitem"
          aria-label={label}
          aria-description={
            id === 'centre'
              ? 'Move Glim to the horizontal centre of the screen'
              : !run
                ? 'Available in the desktop app'
                : undefined
          }
          tabIndex={-1}
          disabled={busy || !run}
          onClick={() => run && void act(run)}
          variants={{
            hidden: { opacity: 0, x: reduced ? 0 : left ? 8 : -8, scale: reduced ? 1 : 0.7 },
            shown: {
              opacity: 1,
              x: 0,
              scale: 1,
              transition: { duration: reduced ? 0.06 : 0.2, ease: [0.23, 1, 0.32, 1] },
            },
          }}
          whileTap={reduced ? undefined : { scale: 0.9 }}
        >
          <Icon size={12} />
        </motion.button>
      ))}
    </motion.div>
  );
}
