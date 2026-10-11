// The 3D Glim as a React component. three.js loads after the page, so until it is ready (or
// where WebGL is missing) the flat character stands in, the same size and mood.
import { useEffect, useRef, useState } from 'react';
import { FlatEyes, type EyesProps } from '../preview-claude/brand';
import type { Handle, Mood, Tone } from './mascot3d';

export type { Mood, Tone };

// Phones draw at 30 frames a second, as the app does: half the work for the same idle motion.
const fps = window.matchMedia('(max-width: 720px)').matches ? 30 : 60;

export function Glim3D({
  tone,
  mood,
  size,
  follow = true,
  hop = 0,
  ratio = 2,
  label,
  className = '',
}: {
  tone: Tone;
  mood: Mood;
  size: number;
  follow?: boolean;
  hop?: number;
  // Most device pixels per CSS pixel; big mascots use less to stay cheap.
  ratio?: number;
  label?: string;
  className?: string;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const handle = useRef<Handle | null>(null);
  const latest = useRef({ tone, mood, follow, hop });
  latest.current = { tone, mood, follow, hop };
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let alive = true;
    import('./mascot3d').then(({ mount }) => {
      if (!alive || !canvas.current) return;
      handle.current = mount(canvas.current, size, { ...latest.current, fps }, ratio);
      setReady(!!handle.current);
    });
    return () => {
      alive = false;
      handle.current?.dispose();
      handle.current = null;
    };
  }, [size, ratio]);
  useEffect(() => {
    handle.current?.update({ tone, mood, follow, hop });
  }, [tone, mood, follow, hop]);

  return (
    <span
      className={`glim3d${ready ? ' is-ready' : ''} ${className}`}
      style={{ width: size, height: size }}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <canvas ref={canvas} style={{ width: size, height: size }} />
      {!ready && <FlatEyes mood={mood} tone={tone} size={size * 0.72} />}
    </span>
  );
}

/**
 * The 3D Glim in the flat character's place, for the island: it keeps the flat one's box (size
 * wide, 32/42 of that tall) so layouts made for it hold, and draws the larger 3D canvas centered
 * on it. The pod fills about 72% of the canvas, as wide as the flat head.
 */
export function Glim3DInPlace({ mood, tone, size = 24, label }: EyesProps) {
  return (
    <span
      className="glim3d-slot"
      style={{ width: size, height: (size * 32) / 42 }}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <Glim3D tone={tone} mood={mood} size={Math.round(size / 0.72)} follow={false} />
    </span>
  );
}
