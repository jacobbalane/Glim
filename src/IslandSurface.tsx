import {
  createContext,
  useContext,
  useEffect,
  useId,
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
import { Ellipsis, X } from 'lucide-react';
import type { Tone } from './Character';
import useIslandDrag from './useIslandDrag';
import IslandOptions from './IslandOptions';
import type { QuickAction } from './quick-options';

export const SURFACE_SPRING = { type: 'spring' as const, stiffness: 420, damping: 40, mass: 1 };
const OPTIONS_HOVER_MS = 500;
// Each control in the options pill is a circle this wide, two pixels from the next.
const OPTION_SIZE = 28;
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
      <motion.div style={{ opacity: ink ? (compact ? ink.compact : ink.expanded) : 1 }}>
        {children}
      </motion.div>
    </motion.div>
  );
}

function FloatingOptions({
  reduced,
  onOpen,
  onMount,
  open,
  menuId,
  left,
  openSize,
  below,
  belowRight,
  belowTop,
  children,
}: {
  reduced: boolean;
  onOpen: () => void;
  onMount: (node: HTMLDivElement | null) => void;
  open: boolean;
  menuId: string;
  left: boolean;
  openSize: number;
  below: boolean;
  belowRight: number;
  belowTop: number;
  children: ReactNode;
}) {
  const present = useIsPresent();
  return (
    <motion.div
      ref={onMount}
      className={`island-options${left ? ' on-left' : ''}${below ? ' below' : ''}`}
      inert={!present}
      aria-hidden={!present || undefined}
      style={{
        pointerEvents: present ? 'auto' : 'none',
        originX: below ? 0.5 : left ? 1 : 0,
        originY: below ? 0 : 0.5,
        ...(below ? { right: belowRight, top: belowTop } : {}),
      }}
      // It buds from the island's edge and tucks back into it.
      initial={{ opacity: 0, x: reduced ? 0 : left ? 10 : -10, scale: reduced ? 1 : 0.6 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: reduced ? 0 : left ? 10 : -10, scale: reduced ? 1 : 0.6 }}
      transition={{
        opacity: { duration: reduced ? 0.06 : 0.15, ease: [0.23, 1, 0.32, 1] },
        default: { ...SURFACE_SPRING, stiffness: 520 },
      }}
    >
      <motion.div
        className="island-options-pill"
        data-left={left}
        initial={false}
        animate={{ width: open ? openSize : OPTION_SIZE, height: OPTION_SIZE }}
        // Opening follows the island's spring; closing is quicker, so the pill never lingers
        // empty after its icons have gone.
        transition={
          reduced
            ? { duration: 0 }
            : open
              ? SURFACE_SPRING
              : { duration: 0.2, ease: [0.23, 1, 0.32, 1] }
        }
      >
        <motion.button
          className="island-options-button"
          aria-label="Glim options"
          aria-haspopup="menu"
          aria-expanded={open}
          aria-controls={open ? menuId : undefined}
          onClick={onOpen}
          whileTap={reduced ? undefined : { scale: 0.92 }}
        >
          {/* Open, the dots turn into a close mark. */}
          <AnimatePresence initial={false} mode="popLayout">
            <motion.span
              key={open ? 'close' : 'more'}
              className="island-options-glyph"
              initial={{ opacity: 0, rotate: reduced ? 0 : open ? -90 : 90, scale: 0.6 }}
              animate={{ opacity: 1, rotate: 0, scale: 1 }}
              exit={{ opacity: 0, rotate: reduced ? 0 : open ? 90 : -90, scale: 0.6 }}
              transition={{ duration: reduced ? 0.06 : 0.18, ease: [0.23, 1, 0.32, 1] }}
            >
              {open ? (
                <X size={14} aria-hidden="true" />
              ) : (
                <Ellipsis size={14} aria-hidden="true" />
              )}
            </motion.span>
          </AnimatePresence>
        </motion.button>
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
  position = 0.5,
  onPosition,
  options,
}: {
  expanded: boolean;
  viewKey: string;
  tone: Tone;
  reduced: boolean;
  children: ReactNode;
  onError: (error: string) => void;
  position?: number;
  onPosition?: (position: number) => Promise<void>;
  options?: QuickAction[];
}) {
  const [viewportWidth, setViewportWidth] = useState(window.innerWidth);
  const [fitted, setFitted] = useState(300);
  const [hovered, setHovered] = useState(false);
  const [hoverReady, setHoverReady] = useState(false);
  const [focused, setFocused] = useState(false);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [optionsSide, setOptionsSide] = useState<'right' | 'left' | 'below'>('right');
  const [belowRight, setBelowRight] = useState(0);
  const [belowTop, setBelowTop] = useState(0);
  const hasOptions = !!options?.length;
  const openOptionsSize = OPTION_SIZE + (options?.length ?? 0) * (OPTION_SIZE + 2);
  const optionsSizeRef = useRef(openOptionsSize);
  optionsSizeRef.current = openOptionsSize;
  const menuId = useId();
  const wide = Math.max(204, Math.min(440, viewportWidth - 40));
  const drag = useIslandDrag({
    position,
    limit: Math.max(0, (viewportWidth - wide) / 2 - 20),
    onPosition,
    onDragging: api.islandDragging,
    onOptions: hasOptions ? () => setOptionsOpen(true) : undefined,
    reduced,
    onError,
  });
  const horizontal = useTransform(drag.x, (value) => Math.round(value));
  const [sideLeft, setSideLeft] = useState(false);
  const cap = Math.min(360, wide - 60);
  const targetWidth = expanded ? wide : Math.max(144, Math.min(cap, fitted));
  const width = useSpring(targetWidth, SURFACE_SPRING);
  const height = useSpring(34, SURFACE_SPRING);
  const target = useMotionValue(targetWidth);
  // Drawn in whole, even pixels: the surface stays centred on the same pixel as it resizes, so the
  // views inside never shift by a fraction, which made their icons jitter between two pixels.
  const even = useTransform(width, (v) => Math.round(v / 2) * 2);
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
  const optionsOpenRef = useRef(optionsOpen);
  optionsOpenRef.current = optionsOpen;
  const scheduled = useRef<number | null>(null);
  const lastShape = useRef('');
  const [slot, setSlot] = useState<HTMLDivElement | null>(null);
  const slotRef = useRef(slot);
  slotRef.current = slot;
  const [optionsSlot, setOptionsSlot] = useState<HTMLDivElement | null>(null);
  const optionsRef = useRef(optionsSlot);
  optionsRef.current = optionsSlot;
  const showOptions =
    hasOptions && !drag.dragging && (optionsOpen || (!expanded && (hoverReady || focused)));
  const closeOptions = (restoreFocus = false) => {
    setOptionsOpen(false);
    if (restoreFocus)
      optionsRef.current
        ?.querySelector<HTMLButtonElement>('button')
        ?.focus({ preventScroll: true });
    else setFocused(false);
  };
  useEffect(() => {
    setOptionsOpen(false);
  }, [expanded, drag.dragging, hasOptions]);
  useEffect(() => {
    if (!optionsOpen) return;
    const outside = (event: Event) => {
      if (!optionsRef.current?.contains(event.target as Node)) closeOptions();
    };
    const key = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      closeOptions(true);
    };
    const blur = () => closeOptions();
    document.addEventListener('pointerdown', outside, true);
    document.addEventListener('focusin', outside);
    document.addEventListener('keydown', key, true);
    window.addEventListener('blur', blur);
    return () => {
      document.removeEventListener('pointerdown', outside, true);
      document.removeEventListener('focusin', outside);
      document.removeEventListener('keydown', key, true);
      window.removeEventListener('blur', blur);
    };
  }, [optionsOpen]);
  useEffect(() => {
    if (!hovered || expanded || drag.dragging || !hasOptions) {
      setHoverReady(false);
      return;
    }
    const timer = setTimeout(() => setHoverReady(true), OPTIONS_HOVER_MS);
    return () => clearTimeout(timer);
  }, [hovered, expanded, drag.dragging, hasOptions]);
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
      const w = even.get(),
        h = Math.round(height.get());
      const left = (window.innerWidth - w) / 2 + Math.round(drag.x.get());
      // Keep the pill horizontal, opening away from the island. Narrow previews
      // place it below the island, with an overlapping pointer bridge above it.
      const size = optionsSizeRef.current;
      const rightRoom = window.innerWidth - (left + w) - 12;
      const leftRoom = left - 12;
      const placement = expandedRef.current
        ? 'left'
        : rightRoom >= size
          ? 'right'
          : leftRoom >= size
            ? 'left'
            : 'below';
      setOptionsSide(placement);
      if (placement === 'below') {
        const edge = Math.min(window.innerWidth - 8, Math.max(size + 8, left + w + 36));
        setBelowRight(left + w - edge);
        setBelowTop(h - 8);
      }
      const panelWidth = slotRef.current?.firstElementChild?.getBoundingClientRect().width ?? 0;
      setSideLeft(
        panelWidth > 0 &&
          left + w + 14 + panelWidth > window.innerWidth - 12 &&
          left - 14 - panelWidth >= 12,
      );
      if (designScene)
        window.parent.postMessage({ type: 'glim:preview:size', height: h }, location.origin);
      if (!native) return;
      const panel = slotRef.current?.firstElementChild?.getBoundingClientRect();
      const floating = optionsRef.current?.getBoundingClientRect();
      const bounds = panel ?? floating;
      const side = bounds
        ? {
            x: Math.floor(bounds.left),
            y: Math.floor(bounds.top),
            width: Math.ceil(bounds.right) - Math.floor(bounds.left),
            height: Math.ceil(bounds.bottom) - Math.floor(bounds.top),
          }
        : null;
      const offset = Math.round(drag.x.get());
      const focusable = expandedRef.current || optionsOpenRef.current;
      const key = `${focusable}:${w}:${h}:${offset}:${side ? Object.values(side) : ''}`;
      if (key === lastShape.current) return;
      lastShape.current = key;
      api.shape(focusable, w, h, side, offset).catch((e) => onError(String(e)));
    });
  };
  useMotionValueEvent(width, 'change', synchronize);
  useMotionValueEvent(height, 'change', synchronize);
  useMotionValueEvent(drag.x, 'change', synchronize);
  useEffect(() => {
    synchronize();
  }, [expanded, sideLeft, optionsOpen, openOptionsSize, optionsSide, belowRight, belowTop]);
  // The native region includes the hover button and a short bridge so it stays reachable.
  // A side panel opening, closing or growing reshapes the window too.
  useEffect(() => {
    synchronize();
    const observer = new ResizeObserver(synchronize);
    if (slot) observer.observe(slot);
    if (optionsSlot) observer.observe(optionsSlot);
    return () => observer.disconnect();
  }, [slot, optionsSlot]);
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
      data-dragging={drag.dragging}
      style={{ width: even, height, x: horizontal, scale: drag.scale, originY: 0 }}
      {...drag.bindings}
      onPointerEnter={(event) => event.pointerType === 'mouse' && setHovered(true)}
      onPointerLeave={() => setHovered(false)}
      onFocusCapture={(event) => {
        if ((event.target as Element).matches(':focus-visible')) setFocused(true);
      }}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node)) setFocused(false);
      }}
    >
      <div className="island-body">
        <span className="shoulder l" aria-hidden="true" />
        <span className="shoulder r" aria-hidden="true" />
        <div ref={setSlot} className={`island-side${sideLeft ? ' on-left' : ''}`} />
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
      </div>
      <AnimatePresence>
        {showOptions && (
          <FloatingOptions
            key="options"
            reduced={reduced}
            onOpen={() => (optionsOpen ? closeOptions(true) : setOptionsOpen(true))}
            onMount={setOptionsSlot}
            open={optionsOpen}
            menuId={menuId}
            left={optionsSide !== 'right'}
            openSize={openOptionsSize}
            below={optionsSide === 'below'}
            belowRight={belowRight}
            belowTop={belowTop}
          >
            <AnimatePresence>
              {optionsOpen && options && (
                <IslandOptions
                  key="menu"
                  id={menuId}
                  reduced={reduced}
                  left={optionsSide !== 'right'}
                  actions={options}
                  onClose={() => closeOptions(true)}
                  onError={onError}
                />
              )}
            </AnimatePresence>
          </FloatingOptions>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
