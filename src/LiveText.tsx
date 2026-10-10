import {
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type Ref,
} from 'react';
import { animate, motion, useIsPresent, useMotionValue } from 'motion/react';
import useReducedMotion from './useReducedMotion';
import { SurfaceInk as Ink } from './IslandSurface';
// The notch line: the project stays put and the status after it scrolls. Text that fits sets
// the island's width; a status past the cap scrolls instead, so the island never grows beyond
// it. Mount it with a key per text so each change starts from the left.
export default function Ticker({
  title,
  children,
  onRun,
  ref,
}: {
  title: ReactNode;
  children?: ReactNode;
  onRun?: (px: number) => void;
  ref?: Ref<HTMLSpanElement>;
}) {
  const reduced = useReducedMotion();
  const ink = useContext(Ink);
  const present = useIsPresent();
  const box = useRef<HTMLSpanElement>(null);
  const copy = useRef<HTMLSpanElement>(null);
  const [run, setRun] = useState(0);
  // New text waits until the island has reached its new width, then fades in. Once it has
  // been shown it stays, so a width change caused by something else never blinks it.
  // The short guard lets the new width be measured before "settled" means anything.
  const settled = useMotionValue(ink ? 0 : 1);
  useEffect(() => {
    if (!ink) return;
    const start = performance.now();
    let frame = requestAnimationFrame(function wait() {
      if (performance.now() - start > 90 && ink.settle.get() > 0.97) {
        animate(settled, 1, { duration: reduced ? 0 : 0.18, ease: [0.23, 1, 0.32, 1] });
        return;
      }
      frame = requestAnimationFrame(wait);
    });
    return () => cancelAnimationFrame(frame);
  }, [ink, settled, reduced]);
  // The notch stays on a scrolling text long enough to read it once.
  useEffect(() => onRun?.(run), [run, onRun]);
  useLayoutEffect(() => {
    const b = box.current;
    const c = copy.current;
    if (!b || !c) return;
    if (reduced) {
      setRun(0);
      return;
    }
    const measure = () => setRun(c.scrollWidth > b.clientWidth + 1 ? c.offsetWidth : 0);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(b);
    observer.observe(c);
    return () => observer.disconnect();
  }, [reduced]);
  return (
    <motion.span
      ref={ref}
      className="compact-text"
      aria-hidden={!present || undefined}
      aria-live={present ? 'polite' : undefined}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: reduced ? 0 : present ? 0.2 : 0.12, ease: [0.23, 1, 0.32, 1] }}
    >
      <motion.span className="compact-line" style={{ opacity: present ? settled : 1 }}>
        <b className="compact-title">{title}</b>
        {children && (
          <span ref={box} className={`ticker-box${run ? ' is-marquee' : ''}`}>
            <span
              className="ticker"
              style={
                run
                  ? ({
                      '--run': `${run}px`,
                      '--speed': `${Math.max(6, run / 40)}s`,
                    } as CSSProperties)
                  : undefined
              }
            >
              <span className="ticker-copy" ref={copy}>
                {children}
              </span>
              {run > 0 && (
                <span className="ticker-copy" aria-hidden="true">
                  {children}
                </span>
              )}
            </span>
          </span>
        )}
      </motion.span>
    </motion.span>
  );
}
