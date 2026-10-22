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
  type MotionStyle,
  type MotionValue,
} from 'motion/react';
import { api, native, designScene, type Notch } from './api';
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
  least,
  fit,
  inset,
  reduced,
  onSize,
  children,
}: {
  width: number;
  // The least width of a view sized by its content.
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
          ? { width: 'max-content', minWidth: least, maxWidth: width, left: 0 }
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
  notch = null,
  position = 0.5,
  onPosition,
  options,
  glow = 50,
  bare = false,
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
  position?: number;
  onPosition?: (position: number) => Promise<void>;
  options?: QuickAction[];
  // The Glow setting, 0 (none) to 100.
  glow?: number;
  // Closed to Glim alone: no surface around it, and only as wide as Glim.
  bare?: boolean;
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
  const glowId = `island-glow-${useId().replace(/[^a-zA-Z0-9-]/g, '')}`;
  // Around a notch, each wing beside the camera is as wide as the wider of the two needs, from
  // 96 to 220 pixels; the open island is at least 160 pixels either side, and never narrower.
  const widest = notch ? Math.min(notch.width + 440, viewportWidth - 40) : 0;
  const narrowest = notch ? Math.min(notch.width + 192, widest) : 0;
  const winged = Math.min(widest, Math.max(narrowest, Math.ceil(fitted / 2) * 2));
  const room = notch ? Math.max(440, notch.width + 320, winged) : 440;
  const wide = Math.max(204, Math.min(room, viewportWidth - 40));
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
  const targetWidth = expanded
    ? wide
    : bare
      ? fitted
      : notch
        ? winged
        : Math.max(144, Math.min(cap, fitted));
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
  // How much of the island is drawn around Glim alone: nothing at Glim's width, all of it 48 pixels
  // wider, so the island grows out of Glim and shrinks back into it. Its light follows.
  const bareWidth = useRef(52);
  const fill = useTransform(() => Math.max(0, Math.min(1, (width.get() - bareWidth.current) / 48)));
  const glowRef = useRef(glow);
  glowRef.current = glow;
  const glowLevel = useTransform(() => (glowRef.current / 100) * fill.get());
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
  const shellRef = useRef<HTMLDivElement>(null);
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
    if (bare) bareWidth.current = Math.ceil(w);
    if (reduced) height.jump(Math.max(floor, h));
    else height.set(Math.max(floor, h));
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
      // Where the side panel or the options come to rest, not where an entrance has them now:
      // a transform never reshapes the window again, so its pointer region must not follow one.
      const resting = (el: Element | null | undefined) => {
        if (!(el instanceof HTMLElement) || !shellRef.current) return el?.getBoundingClientRect();
        let x = 0,
          y = 0,
          node: HTMLElement | null = el;
        while (node && node !== shellRef.current) {
          x += node.offsetLeft;
          y += node.offsetTop;
          node = node.offsetParent as HTMLElement | null;
        }
        if (!node) return el.getBoundingClientRect();
        const shell = shellRef.current.getBoundingClientRect();
        const left = shell.left + x,
          top = shell.top + y;
        return { left, top, right: left + el.offsetWidth, bottom: top + el.offsetHeight };
      };
      const panel = resting(slotRef.current?.firstElementChild);
      const floating = resting(optionsRef.current);
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
      ref={shellRef}
      className="gl shell island-shell"
      data-tone={tone}
      data-compact={!expanded}
      data-testid="island"
      data-expanded={expanded}
      data-bare={bare}
      data-dragging={drag.dragging}
      data-glow={glow === 0 ? 'off' : undefined}
      style={
        {
          width: even,
          height,
          x: horizontal,
          scale: drag.scale,
          originY: 0,
          '--glow-level': glowLevel,
          '--fill': fill,
          '--glow-filter': `url(#${glowId})`,
        } as MotionStyle
      }
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
      {/* The light inside the island follows its whole outline as one shape, the shoulders'
          curves included: everything outside it, blurred inwards and kept inside it, then added
          to the island like light. The screen edge above counts as inside, so it never lights. */}
      <svg className="island-glow-defs" aria-hidden="true" focusable="false" width="0" height="0">
        <filter
          id={glowId}
          x="-20%"
          y="-20%"
          width="140%"
          height="160%"
          colorInterpolationFilters="sRGB"
        >
          <feFlood x="-4000" y="-4000" width="8000" height="4000" result="screen-edge" />
          <feMerge result="solid">
            <feMergeNode in="SourceAlpha" />
            <feMergeNode in="screen-edge" />
          </feMerge>
          <feComponentTransfer in="solid" result="outside">
            <feFuncA type="table" tableValues="1 0" />
          </feComponentTransfer>
          <feGaussianBlur in="outside" stdDeviation={2 + (glow / 100) * 8} result="soft" />
          <feFlood className="island-glow-light" result="light" />
          <feComposite in="light" in2="soft" operator="in" result="rim" />
          <feComposite in="rim" in2="SourceAlpha" operator="in" result="inside" />
          <feBlend in="inside" in2="SourceGraphic" mode="screen" />
        </filter>
      </svg>
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
                  width={expanded ? wide : notch ? widest : cap}
                  least={bare ? 0 : notch ? narrowest : 144}
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
