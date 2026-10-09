import { forwardRef, useLayoutEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useIsPresent } from 'motion/react';

export function WorkingDots({ reduced }: { reduced: boolean }) {
  return (
    <span className={`working-dots ${reduced ? 'still' : ''}`} aria-hidden="true">
      <span>.</span>
      <span>.</span>
      <span>.</span>
    </span>
  );
}

const TextFrame = forwardRef<
  HTMLSpanElement,
  {
    value: string;
    reduced: boolean;
    marquee: boolean;
    working: boolean;
  }
>(function TextFrame({ value, reduced, marquee, working }, forwardedRef) {
  const present = useIsPresent();
  const viewport = useRef<HTMLSpanElement>(null);
  const text = useRef<HTMLSpanElement>(null);
  const [distance, setDistance] = useState(0);
  useLayoutEffect(() => {
    if (!marquee || !viewport.current || !text.current) return;
    const measure = () =>
      setDistance(Math.max(0, text.current!.scrollWidth - viewport.current!.clientWidth));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(viewport.current);
    observer.observe(text.current);
    return () => observer.disconnect();
  }, [marquee, value]);
  const travel = distance / 28;
  return (
    <motion.span
      className={`live-text-frame ${marquee ? 'can-scroll' : ''} ${distance > 1 && !reduced ? 'overflows' : ''}`}
      ref={(node) => {
        viewport.current = node;
        if (typeof forwardedRef === 'function') forwardedRef(node);
        else if (forwardedRef) forwardedRef.current = node;
      }}
      aria-hidden={!present || undefined}
      initial={{ opacity: 0, transform: reduced ? 'none' : 'translateY(6px)' }}
      animate={{ opacity: 1, transform: reduced ? 'none' : 'translateY(0px)' }}
      exit={{ opacity: 0, transform: reduced ? 'none' : 'translateY(-6px)' }}
      transition={{ duration: reduced ? 0.08 : 0.18, ease: [0.23, 1, 0.32, 1] }}
    >
      <motion.span
        ref={text}
        className="live-text-value"
        animate={
          distance > 1 && !reduced
            ? {
                transform: [
                  'translateX(0px)',
                  'translateX(0px)',
                  `translateX(-${distance}px)`,
                  `translateX(-${distance}px)`,
                ],
              }
            : { transform: 'translateX(0px)' }
        }
        transition={
          distance > 1 && !reduced
            ? {
                duration: travel + 4,
                times: [0, 2 / (travel + 4), (travel + 2) / (travel + 4), 1],
                ease: 'linear',
                repeat: Infinity,
                repeatType: 'reverse',
              }
            : { duration: 0 }
        }
      >
        {value}
        {working && <WorkingDots reduced={reduced} />}
      </motion.span>
    </motion.span>
  );
});

export default function LiveText({
  value,
  reduced,
  marquee = false,
  working = false,
  identity = value,
}: {
  value: string;
  reduced: boolean;
  marquee?: boolean;
  working?: boolean;
  identity?: string;
}) {
  return (
    <span
      className={`changing-text ${marquee ? 'live-text-marquee' : ''}`}
      title={marquee ? value : undefined}
    >
      <AnimatePresence initial={false} mode="popLayout">
        <TextFrame
          key={identity}
          value={value}
          reduced={reduced}
          marquee={marquee}
          working={working}
        />
      </AnimatePresence>
    </span>
  );
}

export function StatusDot({ tone }: { tone: string }) {
  return <i className={`status-dot ${tone}`} aria-hidden="true" />;
}
