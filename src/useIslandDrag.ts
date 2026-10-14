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
  const [dragging, setDragging] = useState(false);
  const gesture = useRef<Gesture | null>(null);
  const consumed = useRef(false);
  const nativeState = useRef(Promise.resolve());
  const animation = useRef<{ stop: () => void } | null>(null);
  const previousLimit = useRef(limit);
  const options = useRef({ position, limit, onPosition, onDragging, onOptions, onError });
  options.current = { position, limit, onPosition, onDragging, onOptions, onError };

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

  useLayoutEffect(() => {
    animation.current?.stop();
    const resized = previousLimit.current !== limit;
    previousLimit.current = limit;
    if (gesture.current?.active) x.set(clamp(x.get(), limit));
    else {
      const target = (position - 0.5) * limit * 2;
      if (reduced || resized || Math.abs(x.get() - target) < 0.5) x.set(target);
      else
        animation.current = animate(x, target, {
          type: 'spring',
          duration: 0.8,
          bounce: 0,
        });
    }
  }, [position, limit, reduced, x]);

  const clear = (g: Gesture) => {
    if (g.timer !== null) clearTimeout(g.timer);
    gesture.current = null;
    if (g.handle.hasPointerCapture(g.pointer)) g.handle.releasePointerCapture(g.pointer);
    setDragging(false);
    if (g.active) notifyDragging(false);
  };
  const cancel = () => {
    const g = gesture.current;
    if (!g) return;
    if (g.active) x.set(clamp(g.start, options.current.limit));
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
      if (g?.handle.hasPointerCapture(g.pointer)) g.handle.releasePointerCapture(g.pointer);
      if (g?.active) notifyDragging(false);
    };
  }, []);

  const save = () => {
    const current = options.current;
    const next = current.limit > 0 ? 0.5 + x.get() / (current.limit * 2) : 0.5;
    void current.onPosition?.(next).catch((error) => {
      if (!gesture.current) x.set((options.current.position - 0.5) * options.current.limit * 2);
      current.onError(String(error));
    });
  };
  const move = (event: PointerEvent) => {
    const g = gesture.current;
    if (!g || event.pointerId !== g.pointer) return;
    g.latest = event.clientX;
    if (!g.active) {
      if (Math.hypot(g.latest - g.origin, event.clientY - g.originY) > SLOP) {
        consumed.current = true;
        if (g.timer !== null) clearTimeout(g.timer);
        g.timer = null;
      }
      return;
    }
    event.preventDefault();
    x.set(clamp(g.start + g.latest - g.origin, options.current.limit));
  };

  return {
    x,
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
        };
        gesture.current = g;
        handle.setPointerCapture(event.pointerId);
        g.timer = setTimeout(() => {
          if (gesture.current !== g) return;
          animation.current?.stop();
          g.start = x.get();
          g.active = true;
          g.timer = null;
          consumed.current = true;
          x.set(clamp(g.start + g.latest - g.origin, options.current.limit));
          setDragging(true);
          notifyDragging(true, g);
        }, HOLD_MS);
      },
      onPointerMoveCapture: move,
      onPointerUpCapture: (event: PointerEvent<HTMLDivElement>) => {
        const g = gesture.current;
        if (!g || event.pointerId !== g.pointer) return;
        if (g.active) {
          move(event);
          event.preventDefault();
          save();
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
          animation.current?.stop();
          x.set(clamp(x.get() + (event.key === 'ArrowLeft' ? -24 : 24), options.current.limit));
          save();
        }
      },
    },
  };
}
