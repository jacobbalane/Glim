import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  motion,
  useMotionValueEvent,
  useIsPresent,
  useSpring,
  useTransform,
  type MotionValue,
} from 'motion/react';
import { api, native, designScene } from './api';

export const SURFACE_SPRING = { type: 'spring' as const, stiffness: 430, damping: 42, mass: 1 };
const SurfaceInk = createContext<{
  compact: MotionValue<number>;
  expanded: MotionValue<number>;
  width: MotionValue<number>;
} | null>(null);

export function IslandInk({ compact, children }: { compact: boolean; children: ReactNode }) {
  const ink = useContext(SurfaceInk);
  const present = useIsPresent();
  return (
    <motion.div
      aria-hidden={!present || undefined}
      inert={!present}
      style={{
        opacity: ink ? (compact ? ink.compact : ink.expanded) : 1,
        width: compact ? ink?.width : '100%',
        marginInline: 'auto',
      }}
    >
      {children}
    </motion.div>
  );
}

// Bounds change without scaling the typography. Retargeting preserves spring velocity.
export default function IslandSurface({
  expanded,
  compactWidth,
  reduced,
  children,
  onError,
}: {
  expanded: boolean;
  compactWidth: number;
  reduced: boolean;
  children: ReactNode;
  onError: (error: string) => void;
}) {
  const content = useRef<HTMLDivElement>(null);
  const [viewportWidth, setViewportWidth] = useState(window.innerWidth);
  const canvasWidth = Math.max(144, Math.min(440, viewportWidth - 40));
  const targetWidth = expanded ? canvasWidth : Math.min(compactWidth, canvasWidth);
  const width = useSpring(targetWidth, SURFACE_SPRING);
  const openness = useSpring(expanded ? 1 : 0, SURFACE_SPRING);
  const height = useSpring(expanded ? 154 : 42, SURFACE_SPRING);
  const radius = useTransform(width, [144, 440], [19, 26]);
  // Text is revealed by the actual spring position, so it never scales or overlaps
  // the previous view while the surface opens or reverses direction.
  const compactInk = useTransform(openness, [0, 0.35], [1, 0]);
  const expandedInk = useTransform(openness, [0.6, 1], [0, 1]);
  const expandedRef = useRef(expanded);
  expandedRef.current = expanded;
  const scheduled = useRef<number | null>(null);
  const lastShape = useRef('');
  useEffect(() => {
    const resize = () => setViewportWidth(window.innerWidth);
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);
  useLayoutEffect(() => {
    if (reduced) width.jump(targetWidth);
    else width.set(targetWidth);
  }, [targetWidth, reduced, width]);
  useLayoutEffect(() => {
    if (reduced) openness.jump(expanded ? 1 : 0);
    else openness.set(expanded ? 1 : 0);
  }, [expanded, reduced, openness]);
  useLayoutEffect(() => {
    if (!content.current) return;
    const resize = () => {
      const target = Math.max(42, content.current!.offsetHeight);
      if (reduced) height.jump(target);
      else height.set(target);
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(content.current);
    return () => observer.disconnect();
  }, [expanded, reduced, height]);
  const synchronize = () => {
    if (scheduled.current !== null) return;
    scheduled.current = requestAnimationFrame(() => {
      scheduled.current = null;
      const w = Math.round(width.get()),
        h = Math.round(height.get());
      if (designScene && new URLSearchParams(location.search).get('flow') === '1')
        window.parent.postMessage({ type: 'glim:preview:size', height: h }, location.origin);
      if (!native) return;
      const key = `${expandedRef.current}:${w}:${h}`;
      if (key === lastShape.current) return;
      lastShape.current = key;
      api.shape(expandedRef.current, w, h).catch((e) => onError(String(e)));
    });
  };
  useMotionValueEvent(width, 'change', synchronize);
  useMotionValueEvent(height, 'change', synchronize);
  useEffect(() => {
    synchronize();
  }, [expanded]);
  useEffect(
    () => () => {
      if (scheduled.current !== null) cancelAnimationFrame(scheduled.current);
      scheduled.current = null;
    },
    [],
  );
  return (
    <motion.div
      className="island-shell"
      style={{ width, height }}
      data-testid="island"
      data-expanded={expanded}
    >
      <span className="island-shoulder left" aria-hidden="true" />
      <span className="island-shoulder right" aria-hidden="true" />
      <motion.div
        className={`island ${expanded ? 'expanded' : 'collapsed'}`}
        style={{ borderBottomLeftRadius: radius, borderBottomRightRadius: radius }}
      >
        <div className="island-content" ref={content} style={{ width: canvasWidth }}>
          <SurfaceInk.Provider value={{ compact: compactInk, expanded: expandedInk, width }}>
            {children}
          </SurfaceInk.Provider>
        </div>
      </motion.div>
    </motion.div>
  );
}
