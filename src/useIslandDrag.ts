import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent,
  type MouseEvent,
  type KeyboardEvent,
} from 'react';
import { animate, useMotionValue } from 'motion/react';

const HOLD_MS = 350;
const SLOP = 8;
// A quick click never squeezes the island; a hold starts to after this long.
const PRESS_DELAY_MS = 120;
// How far the island gives under a held pointer, and stays while it is carried.
const HELD_SCALE = 0.97;
// Released this close to the middle, the island settles exactly in it.
const CENTRE_SNAP = 24;
// How far a flick carries the island, as iOS projects a scroll: velocity × r/(1−r) at a
// deceleration rate r per millisecond. 0.99 is UIKit's fast rate.
const FLICK = 0.99 / (1 - 0.99) / 1000;
// Faster than a hand moves, in pixels a second: a jump in pointer input, not a throw.
const MAX_SPEED = 2500;
const SETTLE = { type: 'spring' as const, stiffness: 420, damping: 40, mass: 1 };
const clamp = (value: number, limit: number) => Math.max(-limit, Math.min(limit, value));

type Gesture = {
  pointer: number;
  handle: HTMLElement;
  origin: number;
  originY: number;
  latest: number;
  start: number;
  active: boolean;
  timer: ReturnType<typeof setTimeout> | null;
  press: ReturnType<typeof setTimeout> | null;
  // The latest pointer event's time, in the events' own clock.
  time: number;
  // Recent positions while carried, for the release velocity.
  samples: { time: number; x: number }[];
};

export default function useIslandDrag({
  position,
  limit,
  onPosition,
  onDragging,
  onOptions,
  reduced = false,
  onError,
}: {
  position: number;
  limit: number;
  onPosition?: (position: number) => Promise<void>;
  onDragging?: (active: boolean) => Promise<void>;
  onOptions?: () => void;
  reduced?: boolean;
  onError: (error: string) => void;
}) {
  const x = useMotionValue((position - 0.5) * limit * 2);
  const scale = useMotionValue(1);
  const [dragging, setDragging] = useState(false);
  const gesture = useRef<Gesture | null>(null);
  const consumed = useRef(false);
  const nativeState = useRef(Promise.resolve());
  const animation = useRef<{ stop: () => void; target: number } | null>(null);
  const previousLimit = useRef(limit);
  const options = useRef({ position, limit, onPosition, onDragging, onOptions, onError, reduced });
  options.current = { position, limit, onPosition, onDragging, onOptions, onError, reduced };

  // Keep native capture changes in order when a hold is cancelled during activation.
  const notifyDragging = (active: boolean, g?: Gesture) => {
    nativeState.current = nativeState.current
      .then(() => options.current.onDragging?.(active))
      .then(() => {
        if (active && gesture.current === g) g?.handle.setPointerCapture(g.pointer);
      })
      .catch((error) => {
        if (active && gesture.current === g) cancel();
        options.current.onError(String(error));
      });
  };
  // Moves the island to `target`, carrying any velocity it has, unless reduced motion asks for a
  // jump. The saved position catching up later leaves a glide to the same place alone.
  const glide = (target: number, velocity = 0, transition: object = SETTLE) => {
    animation.current?.stop();
    animation.current = null;
    if (options.current.reduced || Math.abs(x.get() - target) < 0.5) {
      x.set(target);
      return;
    }
    const controls = animate(x, target, { ...transition, velocity });
    animation.current = { stop: () => controls.stop(), target };
  };
  const squeeze = (value: number) => {
    if (options.current.reduced) scale.set(1);
    else
      animate(
        scale,
        value,
        value < 1 ? { duration: 0.24, ease: [0.23, 1, 0.32, 1] } : { ...SETTLE, stiffness: 520 },
      );
  };

  useLayoutEffect(() => {
    const resized = previousLimit.current !== limit;
    previousLimit.current = limit;
    if (gesture.current?.active) {
      x.set(clamp(x.get(), limit));
      return;
    }
    const target = (position - 0.5) * limit * 2;
    if (!resized && animation.current && Math.abs(animation.current.target - target) < 0.5) return;
    if (resized) {
      animation.current?.stop();
      animation.current = null;
      x.set(target);
    } else glide(target, 0, { type: 'spring', duration: 0.8, bounce: 0 });
  }, [position, limit, reduced, x]);

  const clear = (g: Gesture) => {
    if (g.timer !== null) clearTimeout(g.timer);
    if (g.press !== null) clearTimeout(g.press);
    gesture.current = null;
    if (g.handle.hasPointerCapture(g.pointer)) g.handle.releasePointerCapture(g.pointer);
    setDragging(false);
    squeeze(1);
    if (g.active) notifyDragging(false);
  };
  const cancel = () => {
    const g = gesture.current;
    if (!g) return;
    if (g.active) glide(clamp(g.start, options.current.limit));
    clear(g);
  };
  useEffect(() => {
    const blur = () => cancel();
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('blur', blur);
      animation.current?.stop();
      const g = gesture.current;
      gesture.current = null;
      if (g?.timer !== null && g?.timer !== undefined) clearTimeout(g.timer);
      if (g?.press !== null && g?.press !== undefined) clearTimeout(g.press);
      if (g?.handle.hasPointerCapture(g.pointer)) g.handle.releasePointerCapture(g.pointer);
      if (g?.active) notifyDragging(false);
    };
  }, []);

  const save = (target: number) => {
    const current = options.current;
    const next = current.limit > 0 ? 0.5 + target / (current.limit * 2) : 0.5;
    void current.onPosition?.(next).catch((error) => {
      if (!gesture.current) glide((options.current.position - 0.5) * options.current.limit * 2);
      current.onError(String(error));
    });
  };
  // Where a released island comes to rest: as far as its flick carries it, inside the screen,
  // or exactly in the middle when it lands close to it.
  const rest = (from: number, velocity: number) => {
    const projected = clamp(from + velocity * FLICK, options.current.limit);
    return Math.abs(projected) < CENTRE_SNAP ? 0 : projected;
  };
  // Pixels a second over the pointer's last 100 ms, in its own event clock. A pointer that
  // stopped before letting go, or that only jumped once after a still hold, throws nothing.
  const velocity = (g: Gesture, released: number) => {
    const recent = g.samples.filter((sample) => g.time - sample.time <= 100);
    const first = recent[0];
    const last = recent[recent.length - 1];
    if (recent.length < 2 || released - last.time > 80 || last.time === first.time) return 0;
    const speed = ((last.x - first.x) / (last.time - first.time)) * 1000;
    return Math.max(-MAX_SPEED, Math.min(MAX_SPEED, speed));
  };
  const move = (event: PointerEvent, sample = true) => {
    const g = gesture.current;
    if (!g || event.pointerId !== g.pointer) return;
    g.latest = event.clientX;
    if (sample) g.time = event.timeStamp;
    if (!g.active) {
      if (Math.hypot(g.latest - g.origin, event.clientY - g.originY) > SLOP) {
        consumed.current = true;
        if (g.timer !== null) clearTimeout(g.timer);
        if (g.press !== null) clearTimeout(g.press);
        g.timer = g.press = null;
        squeeze(1);
      }
      return;
    }
    event.preventDefault();
    x.set(clamp(g.start + g.latest - g.origin, options.current.limit));
    if (!sample) return;
    g.samples.push({ time: g.time, x: x.get() });
    while (g.samples.length > 1 && g.time - g.samples[0].time > 100) g.samples.shift();
  };

  return {
    x,
    scale,
    dragging,
    bindings: {
      onPointerDownCapture: (event: PointerEvent<HTMLDivElement>) => {
        if (
          !options.current.onPosition ||
          event.button !== 0 ||
          !event.isPrimary ||
          gesture.current
        )
          return;
        consumed.current = false;
        const target = event.target as Element;
        const handle = target.closest<HTMLElement>('[data-island-drag]');
        if (!handle || !event.currentTarget.contains(handle)) return;
        const control = target.closest('button, a, input, select, textarea, [role="button"]');
        if (control && control !== handle) return;
        const g: Gesture = {
          pointer: event.pointerId,
          handle,
          origin: event.clientX,
          originY: event.clientY,
          latest: event.clientX,
          start: x.get(),
          active: false,
          timer: null,
          press: null,
          time: event.timeStamp,
          samples: [],
        };
        gesture.current = g;
        handle.setPointerCapture(event.pointerId);
        g.press = setTimeout(() => {
          g.press = null;
          if (gesture.current === g) squeeze(HELD_SCALE);
        }, PRESS_DELAY_MS);
        g.timer = setTimeout(() => {
          if (gesture.current !== g) return;
          // Picked up mid-glide, the island stays under the pointer from where it is.
          animation.current?.stop();
          animation.current = null;
          g.start = x.get();
          g.active = true;
          g.timer = null;
          consumed.current = true;
          x.set(clamp(g.start + g.latest - g.origin, options.current.limit));
          g.samples = [{ time: g.time, x: x.get() }];
          setDragging(true);
          notifyDragging(true, g);
        }, HOLD_MS);
      },
      onPointerMoveCapture: move,
      onPointerUpCapture: (event: PointerEvent<HTMLDivElement>) => {
        const g = gesture.current;
        if (!g || event.pointerId !== g.pointer) return;
        if (g.active) {
          move(event, false);
          event.preventDefault();
          const thrown = options.current.reduced ? 0 : velocity(g, event.timeStamp);
          const target = rest(x.get(), thrown);
          glide(target, thrown);
          save(target);
        }
        clear(g);
      },
      onPointerCancelCapture: cancel,
      onLostPointerCapture: cancel,
      onClickCapture: (event: MouseEvent<HTMLDivElement>) => {
        if (event.detail === 0) return;
        if (consumed.current) {
          consumed.current = false;
          event.preventDefault();
          event.stopPropagation();
        }
      },
      onContextMenu: (event: MouseEvent<HTMLDivElement>) => {
        if (gesture.current?.active || consumed.current) event.preventDefault();
        else {
          const target = event.target as Element;
          const handle = target.closest('[data-island-drag], [data-island-options]');
          const control = target.closest('button, a, input, select, textarea, [role="button"]');
          if (handle && (!control || control === handle) && options.current.onOptions) {
            event.preventDefault();
            options.current.onOptions();
          }
        }
      },
      onKeyDownCapture: (event: KeyboardEvent<HTMLDivElement>) => {
        if (event.key === 'Escape' && gesture.current) {
          event.preventDefault();
          event.stopPropagation();
          cancel();
        } else if (
          (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) &&
          (event.target as Element).matches('[data-island-drag], [data-island-options]') &&
          options.current.onOptions
        ) {
          event.preventDefault();
          event.stopPropagation();
          options.current.onOptions();
        } else if (
          event.altKey &&
          ['ArrowLeft', 'ArrowRight'].includes(event.key) &&
          (event.target as Element).closest('[data-island-drag]') &&
          options.current.onPosition
        ) {
          event.preventDefault();
          // Repeated nudges add up from where the last one is heading, not from mid-glide.
          const from = animation.current?.target ?? x.get();
          const target = clamp(
            from + (event.key === 'ArrowLeft' ? -24 : 24),
            options.current.limit,
          );
          glide(target);
          save(target);
        }
      },
    },
  };
}
