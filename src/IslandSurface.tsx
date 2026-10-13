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
import { api, native, designScene, type Notch } from './api';
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
  least,
  fit,
  inset,
  reduced,
  onSize,
  children,
}: {
  width: number;
  // The least width of a view sized about the centre.
  least: number;
  // How the view is sized: by its content from the left edge, by its content about the centre
  // (around a notch), or at the open island's width.
  fit: 'start' | 'centre' | 'open';
  inset: number;
  reduced: boolean;
  onSize: (width: number, height: number) => void;
  children: ReactNode;
}) {
  const ink = useContext(SurfaceInk);
  const present = useIsPresent();
  const ref = useRef<HTMLDivElement>(null);
  const report = useRef(onSize);
  report.current = onSize;
  const [own, setOwn] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!present || !el) return;
    const send = () => {
      setOwn(el.offsetWidth);
      report.current(el.offsetWidth, el.offsetHeight + inset);
    };
    send();
    const observer = new ResizeObserver(send);
    observer.observe(el);
    return () => observer.disconnect();
  }, [present, inset]);
  return (
    <motion.div
      ref={ref}
      className="frame"
      style={
        fit === 'start'
          ? { width: 'max-content', minWidth: 144, maxWidth: width, left: 0 }
          : fit === 'centre'
            ? {
                width: 'max-content',
                minWidth: least,
                maxWidth: width,
                marginLeft: -Math.ceil(own / 2),
              }
            : { width, marginLeft: -width / 2, top: inset }
      }
      inert={!present}
      aria-hidden={!present || undefined}
      initial={{ opacity: 0, filter: reduced ? 'none' : 'blur(3px)' }}
      // The new view arrives about as fast as the surface makes room for it; the old one leaves
      // quickly.
      animate={{
        opacity: 1,
        filter: reduced ? 'none' : 'blur(0px)',
        transition: { duration: reduced ? 0.06 : 0.32, ease: [0.23, 1, 0.32, 1] },
      }}
      exit={{
        opacity: 0,
        filter: reduced ? 'none' : 'blur(3px)',
        transition: { duration: reduced ? 0.06 : 0.18, ease: [0.23, 1, 0.32, 1] },
      }}
    >
      <motion.div style={{ opacity: ink ? (fit === 'start' ? ink.compact : ink.expanded) : 1 }}>
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
  notch = null,
}: {
  expanded: boolean;
  viewKey: string;
  tone: Tone;
  reduced: boolean;
  children: ReactNode;
  onError: (error: string) => void;
  // A Mac's camera notch: the island takes its height when compact and keeps the open island's
  // width, the camera between its two wings; open views start below it.
  notch?: Notch | null;
}) {
  const [viewportWidth, setViewportWidth] = useState(window.innerWidth);
  const [fitted, setFitted] = useState(300);
  // Around a notch, each wing beside the camera is as wide as the wider of the two needs, from
  // 96 to 220 pixels; the open island is at least 160 pixels either side, and never narrower.
  const widest = notch ? Math.min(notch.width + 440, viewportWidth - 40) : 0;
  const narrowest = notch ? Math.min(notch.width + 192, widest) : 0;
  const winged = Math.min(widest, Math.max(narrowest, Math.ceil(fitted / 2) * 2));
  const room = notch ? Math.max(440, notch.width + 320, winged) : 440;
  const wide = Math.max(204, Math.min(room, viewportWidth - 40));
  const cap = Math.min(360, wide - 60);
  const targetWidth = expanded ? wide : notch ? winged : Math.max(144, Math.min(cap, fitted));
  const floor = notch && !expanded ? notch.height : 34;
  const inset = notch && expanded ? notch.height : 0;
  const width = useSpring(targetWidth, SURFACE_SPRING);
  const height = useSpring(floor, SURFACE_SPRING);
  const target = useMotionValue(targetWidth);
  // Drawn in whole, even pixels: the surface stays centred on the same pixel as it resizes, so the
  // views inside never shift by a fraction, which made their icons jitter between two pixels.
  const even = useTransform(width, (v) => Math.round(v / 2) * 2);
  // Without a notch the island widens as it opens, and its corners and content follow the width.
  // Around a notch only its height changes, so the corners follow that and both views stay inked.
  const widthRadius = useTransform(width, [cap, wide], [17, 24]);
  const notchHeight = notch?.height ?? 34;
  const heightRadius = useTransform(height, [notchHeight, notchHeight + 80], [12, 24]);
  const radius = notch ? heightRadius : widthRadius;
  const widthCompact = useTransform(width, [cap, cap + 26], [1, 0]);
  const widthExpanded = useTransform(width, [wide - 30, wide], [0, 1]);
  const solid = useMotionValue(1);
  const compactInk = notch ? solid : widthCompact;
  const expandedInk = notch ? solid : widthExpanded;
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
    if (reduced) height.jump(Math.max(floor, h));
    else height.set(Math.max(floor, h));
  };
  const synchronize = () => {
    if (scheduled.current !== null) return;
    scheduled.current = requestAnimationFrame(() => {
      scheduled.current = null;
      const w = even.get(),
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
      style={{ width: even, height }}
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
                width={expanded ? wide : notch ? widest : cap}
                least={narrowest}
                fit={expanded ? 'open' : notch ? 'centre' : 'start'}
                inset={inset}
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
