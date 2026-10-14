import { useEffect, useId, useRef, useState } from 'react';
import { AnimatePresence, motion, Reorder, useDragControls, useReducedMotion } from 'motion/react';
import { Check, GripVertical } from 'lucide-react';
import { Switch } from './island-components';
import { QUICK_OPTIONS, quickOptionOrder } from './quick-options';
import type { Preferences, QuickOptionId } from './types';

type Choices = Pick<Preferences, 'quickOptionsEnabled' | 'quickOptions' | 'quickOptionsOrder'>;
const choicesOf = (prefs: Preferences): Choices => ({
  quickOptionsEnabled: prefs.quickOptionsEnabled,
  quickOptions: prefs.quickOptions,
  quickOptionsOrder: quickOptionOrder(prefs.quickOptionsOrder),
});

export default function QuickOptionsSettings({
  prefs,
  onPrefs,
}: {
  prefs: Preferences;
  onPrefs: (next: Preferences) => Promise<void>;
}) {
  const reduced = !!useReducedMotion();
  const instructions = useId();
  const latest = useRef(prefs);
  latest.current = prefs;
  const [choices, setChoices] = useState(() => choicesOf(prefs));
  const draft = useRef(choices);
  const queued = useRef<Choices | null>(null);
  const saving = useRef(false);
  const dragging = useRef(false);
  const original = useRef<QuickOptionId[]>([]);
  const [grabbed, setGrabbed] = useState<QuickOptionId | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [announcement, announce] = useState('');
  useEffect(() => {
    if (!saving.current && !dragging.current) {
      draft.current = choicesOf(prefs);
      setChoices(draft.current);
    }
  }, [prefs]);
  const update = (next: Choices) => {
    draft.current = next;
    setChoices(next);
  };
  // Keep the UI responsive, coalescing rapid selections while a disk write is in flight.
  const commit = async (next: Choices) => {
    update(next);
    queued.current = next;
    setError(null);
    if (saving.current) return;
    saving.current = true;
    while (queued.current) {
      const pending = queued.current;
      queued.current = null;
      try {
        await onPrefs({ ...latest.current, ...pending });
      } catch (e) {
        setError(String(e));
        if (!queued.current) update(choicesOf(latest.current));
      }
    }
    saving.current = false;
  };
  const start = (id: QuickOptionId) => {
    original.current = [...draft.current.quickOptionsOrder];
    dragging.current = true;
    setGrabbed(id);
    announce(`${QUICK_OPTIONS[id].label} picked up.`);
  };
  const finish = (cancelled = false) => {
    if (!dragging.current) return;
    dragging.current = false;
    setGrabbed(null);
    if (cancelled) update({ ...draft.current, quickOptionsOrder: original.current });
    else void commit(draft.current);
    announce(cancelled ? 'Reorder cancelled.' : 'Order updated.');
  };
  useEffect(() => {
    const cancel = () => finish(true);
    window.addEventListener('blur', cancel);
    return () => window.removeEventListener('blur', cancel);
  });
  return (
    <div className="quick-options-settings">
      <Switch
        label="Quick options"
        checked={choices.quickOptionsEnabled}
        onChange={(enabled) => {
          finish(true);
          void commit({ ...draft.current, quickOptionsEnabled: enabled });
        }}
      />
      <div inert={!choices.quickOptionsEnabled}>
        <AnimatePresence initial={false}>
          {choices.quickOptionsEnabled && (
            <motion.div
              className="quick-options-choices"
              key="choices"
              initial={{ height: reduced ? 'auto' : 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: reduced ? 'auto' : 0, opacity: 0 }}
              transition={{
                height: { type: 'spring', stiffness: 420, damping: 40 },
                opacity: { duration: reduced ? 0.06 : 0.15 },
              }}
            >
              <p className="fine">Choose actions. Drag to reorder.</p>
              <p id={instructions} className="sr-only">
                Press Space to pick up a row, arrow keys to move it, Space to drop, or Escape to
                cancel.
              </p>
              <Reorder.Group
                axis="y"
                values={choices.quickOptionsOrder}
                className="quick-options-list"
                aria-label="Quick options order"
                onReorder={(order) => update({ ...draft.current, quickOptionsOrder: order })}
              >
                {choices.quickOptionsOrder.map((id) => (
                  <ChoiceRow
                    key={id}
                    id={id}
                    reduced={reduced}
                    instructions={instructions}
                    selected={choices.quickOptions.includes(id)}
                    grabbed={grabbed === id}
                    onSelect={() =>
                      void commit({
                        ...draft.current,
                        quickOptions: draft.current.quickOptions.includes(id)
                          ? draft.current.quickOptions.filter((item) => item !== id)
                          : [...draft.current.quickOptions, id],
                      })
                    }
                    onStart={() => start(id)}
                    onFinish={finish}
                    onMove={(direction) => {
                      const order = [...draft.current.quickOptionsOrder];
                      const index = order.indexOf(id);
                      const next = Math.max(0, Math.min(order.length - 1, index + direction));
                      order.splice(index, 1);
                      order.splice(next, 0, id);
                      update({ ...draft.current, quickOptionsOrder: order });
                      announce(
                        `${QUICK_OPTIONS[id].label}, position ${next + 1} of ${order.length}.`,
                      );
                    }}
                  />
                ))}
              </Reorder.Group>
              {choices.quickOptions.length === 0 && (
                <p className="fine">Select an action to show the pill.</p>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      <span className="sr-only" role="status" aria-live="polite">
        {announcement}
      </span>
      {error && (
        <p className="inline-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

function ChoiceRow({
  id,
  selected,
  grabbed,
  reduced,
  instructions,
  onSelect,
  onStart,
  onFinish,
  onMove,
}: {
  id: QuickOptionId;
  selected: boolean;
  grabbed: boolean;
  reduced: boolean;
  instructions: string;
  onSelect: () => void;
  onStart: () => void;
  onFinish: (cancelled?: boolean) => void;
  onMove: (direction: number) => void;
}) {
  const controls = useDragControls();
  const keyboard = useRef(false);
  const { label, Icon } = QUICK_OPTIONS[id];
  useEffect(() => {
    if (!grabbed) {
      controls.cancel();
      keyboard.current = false;
    }
  }, [grabbed, controls]);
  return (
    <Reorder.Item
      value={id}
      className="quick-option-row"
      tabIndex={0}
      aria-label={`Reorder ${label}`}
      aria-describedby={instructions}
      data-grabbed={grabbed}
      dragListener={false}
      dragControls={controls}
      layout="position"
      transition={{
        layout: reduced ? { duration: 0 } : { type: 'spring', stiffness: 420, damping: 40 },
      }}
      onPointerDown={(event) => {
        if (event.button !== 0 || (event.target as Element).closest('button')) return;
        event.currentTarget.focus({ preventScroll: true });
        keyboard.current = false;
        controls.start(event);
      }}
      onDragStart={onStart}
      onDragEnd={() => onFinish()}
      onPointerCancel={() => {
        controls.cancel();
        onFinish(true);
      }}
      onKeyDown={(event) => {
        if ((event.target as Element).closest('button')) return;
        if (event.key === ' ') {
          event.preventDefault();
          if (grabbed) {
            onFinish();
            keyboard.current = false;
          } else {
            keyboard.current = true;
            onStart();
          }
        } else if (grabbed && event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          controls.cancel();
          onFinish(true);
        } else if (
          grabbed &&
          keyboard.current &&
          ['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)
        ) {
          event.preventDefault();
          onMove(
            event.key === 'Home' ? -6 : event.key === 'End' ? 6 : event.key === 'ArrowUp' ? -1 : 1,
          );
        } else if (grabbed && keyboard.current && event.key === 'Tab') onFinish();
      }}
    >
      <GripVertical size={14} className="quick-option-grip" aria-hidden="true" />
      <Icon size={14} />
      <span>{label}</span>
      <button
        className="quick-option-select"
        role="checkbox"
        aria-label={label}
        aria-checked={selected}
        onClick={onSelect}
      >
        {selected && <Check size={12} strokeWidth={2.5} />}
      </button>
    </Reorder.Item>
  );
}
