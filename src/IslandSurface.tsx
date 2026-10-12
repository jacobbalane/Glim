import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  AnimatePresence,
  motion,
  useIsPresent,
  useMotionValue,
  useMotionValueEvent,
  useSpring,
  useTransform,
  type MotionValue,
} from 'motion/react';
import { api, native, designScene } from './api';
import type { Tone } from './Character';

export const SURFACE_SPRING = { type: 'spring' as const, stiffness: 420, damping: 40, mass: 1 };
export const SurfaceInk = createContext<{
  compact: MotionValue<number>;
  expanded: MotionValue<number>;
  settle: MotionValue<number>;
} | null>(null);
// Where a view puts a panel beside the open island, such as an agent's full message.
export const SideSlot = createContext<HTMLElement | null>(null);

// An exiting view keeps its own layout; only the incoming view measures the surface.
function ViewFrame({
  width,
  compact,
  reduced,
  onSize,
  children,
}: {
  width: number;
  compact: boolean;
  reduced: boolean;
  onSize: (width: number, height: number) => void;
  children: ReactNode;
}) {
  const ink = useContext(SurfaceInk);
  const present = useIsPresent();
  const ref = useRef<HTMLDivElement>(null);
  const report = useRef(onSize);
  report.current = onSize;
  useLayoutEffect(() => {
    const el = ref.current;
    if (!present || !el) return;
    const send = () => report.current(el.offsetWidth, el.offsetHeight);
    send();
    const observer = new ResizeObserver(send);
    observer.observe(el);
    return () => observer.disconnect();
  }, [present]);
  return (
    <motion.div
      ref={ref}
      className="frame"
      style={
        compact
          ? { width: 'max-content', minWidth: 144, maxWidth: width, left: 0 }
          : { width, marginLeft: -width / 2 }
      }
      inert={!present}
      aria-hidden={!present || undefined}
      initial={{ opacity: 0, filter: reduced ? 'none' : 'blur(3px)' }}
      animate={{ opacity: 1, filter: reduced ? 'none' : 'blur(0px)' }}
      exit={{ opacity: 0, filter: reduced ? 'none' : 'blur(3px)' }}
      transition={{ duration: reduced ? 0.06 : 0.2, ease: [0.23, 1, 0.32, 1] }}
    >
      <motion.div style={{ opacity: ink ? (compact ? ink.compact : ink.expanded) : 1 }}>
        {children}
      </motion.div>
    </motion.div>
  );
}

export default function IslandSurface({
  expanded,
  viewKey,
  tone,
  reduced,
  children,
  onError,
}: {
  expanded: boolean;
  viewKey: string;
  tone: Tone;
  reduced: boolean;
  children: ReactNode;
  onError: (error: string) => void;
}) {
  const [viewportWidth, setViewportWidth] = useState(window.innerWidth);
  const wide = Math.max(204, Math.min(440, viewportWidth - 40));
  const cap = Math.min(360, wide - 60);
  const [fitted, setFitted] = useState(300);
  const targetWidth = expanded ? wide : Math.max(144, Math.min(cap, fitted));
  const width = useSpring(targetWidth, SURFACE_SPRING);
  const height = useSpring(34, SURFACE_SPRING);
  const target = useMotionValue(targetWidth);
  const radius = useTransform(width, [cap, wide], [17, 24]);
  const compactInk = useTransform(width, [cap, cap + 26], [1, 0]);
  const expandedInk = useTransform(width, [wide - 30, wide], [0, 1]);
  const settle = useTransform(() =>
    Math.max(0, Math.min(1, 1 - (Math.abs(width.get() - target.get()) - 3) / 16)),
  );
  const ink = useMemo(
    () => ({ compact: compactInk, expanded: expandedInk, settle }),
    [compactInk, expandedInk, settle],
  );
  const expandedRef = useRef(expanded);
  expandedRef.current = expanded;
  const scheduled = useRef<number | null>(null);
  const lastShape = useRef('');
  const [slot, setSlot] = useState<HTMLDivElement | null>(null);
  const slotRef = useRef(slot);
  slotRef.current = slot;
  useEffect(() => {
    const resize = () => setViewportWidth(window.innerWidth);
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);
  useLayoutEffect(() => {
    target.set(targetWidth);
    if (reduced) width.jump(targetWidth);
    else width.set(targetWidth);
  }, [targetWidth, reduced, width, target]);
  const onSize = (w: number, h: number) => {
    if (!expanded) setFitted(Math.ceil(w));
    if (reduced) height.jump(Math.max(34, h));
    else height.set(Math.max(34, h));
  };
  const synchronize = () => {
    if (scheduled.current !== null) return;
    scheduled.current = requestAnimationFrame(() => {
      scheduled.current = null;
      const w = Math.round(width.get()),
        h = Math.round(height.get());
      if (designScene)
        window.parent.postMessage({ type: 'glim:preview:size', height: h }, location.origin);
      if (!native) return;
      const panel = slotRef.current?.firstElementChild?.getBoundingClientRect();
      const side = panel
        ? {
            x: Math.floor(panel.left),
            y: Math.floor(panel.top),
            width: Math.ceil(panel.width),
            height: Math.ceil(panel.height),
          }
        : null;
      const key = `${expandedRef.current}:${w}:${h}:${side ? Object.values(side) : ''}`;
      if (key === lastShape.current) return;
      lastShape.current = key;
      api.shape(expandedRef.current, w, h, side).catch((e) => onError(String(e)));
    });
  };
  useMotionValueEvent(width, 'change', synchronize);
  useMotionValueEvent(height, 'change', synchronize);
  useEffect(() => {
    synchronize();
  }, [expanded]);
  // A side panel opening, closing or growing reshapes the window too.
  useEffect(() => {
    if (!slot) return;
    const observer = new ResizeObserver(synchronize);
    observer.observe(slot);
    return () => observer.disconnect();
  }, [slot]);
  useEffect(
    () => () => {
      if (scheduled.current !== null) cancelAnimationFrame(scheduled.current);
      scheduled.current = null;
    },
    [],
  );
  return (
    <motion.div
      className="gl shell island-shell"
      data-tone={tone}
      data-compact={!expanded}
      data-testid="island"
      data-expanded={expanded}
      style={{ width, height }}
    >
      <span className="shoulder l" aria-hidden="true" />
      <span className="shoulder r" aria-hidden="true" />
      <div ref={setSlot} className="island-side" />
      <motion.div
        className="surface island"
        style={{ borderBottomLeftRadius: radius, borderBottomRightRadius: radius }}
      >
        <SurfaceInk.Provider value={ink}>
          <SideSlot.Provider value={slot}>
            <AnimatePresence initial={false}>
              <ViewFrame
                key={viewKey}
                width={expanded ? wide : cap}
                compact={!expanded}
                reduced={reduced}
                onSize={onSize}
              >
                {children}
              </ViewFrame>
            </AnimatePresence>
          </SideSlot.Provider>
        </SurfaceInk.Provider>
      </motion.div>
    </motion.div>
  );
}
