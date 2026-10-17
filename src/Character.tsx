// Character geometry from the approved interface reference.
import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { useIsPresent } from 'motion/react';
import useReducedMotion from './useReducedMotion';
import type { Handle, Options } from './mascot-renderer';

export type Tone = 'active' | 'attention' | 'error' | 'limit' | 'success' | 'done' | 'calm' | 'off';
export type Mood = 'scan' | 'wide' | 'happy' | 'open' | 'cross' | 'half' | 'closed';

/**
 * The island's pod with its flat top at `top`: top corners rounded to `r`, sides straight up,
 * a round bottom. `w` is the width, `h` the height.
 */
export function podPath(cx: number, w: number, h: number, r: number, top = 0) {
  const left = cx - w / 2;
  const right = cx + w / 2;
  const bend = top + h - 0.375 * w;
  return [
    `M${left + r} ${top}H${right - r}`,
    `A${r} ${r} 0 0 1 ${right} ${top + r}`,
    `V${bend}`,
    `C${right} ${bend + 0.235 * w} ${cx + 0.2875 * w} ${top + h} ${cx} ${top + h}`,
    `S${left} ${bend + 0.235 * w} ${left} ${bend}`,
    `V${top + r}`,
    `A${r} ${r} 0 0 1 ${left + r} ${top}Z`,
  ].join('');
}
function capsule(cx: number, cy: number, w: number, h: number) {
  const r = w / 2;
  return `M${cx - r} ${cy - h / 2 + r}a${r} ${r} 0 0 1 ${w} 0v${h - w}a${r} ${r} 0 0 1 ${-w} 0Z`;
}

/** The character at any size: body and eye holes, in the proportions of the 40-unit logo. */
export function glimPath(cx: number, top: number, w: number, eyeScale = 1) {
  const ew = 0.2 * w * eyeScale;
  const eh = 0.32 * w * eyeScale;
  const ey = top + 0.36 * w;
  const gap = 0.19 * w;
  return {
    body: podPath(cx, w, 0.75 * w, 0.15 * w, top),
    eyes: capsule(cx - gap, ey, ew, eh) + capsule(cx + gap, ey, ew, eh),
    happy: [-gap, gap]
      .map(
        (g) =>
          `M${cx + g - 0.1 * w} ${ey + 0.075 * w}Q${cx + g} ${ey - 0.115 * w} ${cx + g + 0.1 * w} ${ey + 0.075 * w}`,
      )
      .join(''),
  };
}

const BODY = glimPath(32, 0, 40).body;

/** Glim indigo: the primary logo is this body with white eyes, on any background. */
export const GLIM_INDIGO = '#6366f1';

/**
 * The character. Its fill is the state color and its eyes are the mood. `brand` is the
 * primary logo: Glim indigo with white eyes.
 */
export function FlatEyes({
  mood,
  tone,
  size = 24,
  follow = false,
  label,
}: {
  mood: Mood;
  tone: Tone | 'brand';
  size?: number;
  follow?: boolean;
  label?: string;
}) {
  const ref = useRef<SVGSVGElement>(null);
  const reduced = useReducedMotion();
  useEffect(() => {
    if (!follow || reduced) return;
    const move = (event: PointerEvent) => {
      const el = ref.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const x = Math.max(-1, Math.min(1, (event.clientX - r.left - r.width / 2) / 280));
      const y = Math.max(-1, Math.min(1, (event.clientY - r.top - r.height / 2) / 280));
      el.style.setProperty('--look-x', `${x * 3}px`);
      el.style.setProperty('--look-y', `${y * 2}px`);
    };
    window.addEventListener('pointermove', move);
    return () => {
      window.removeEventListener('pointermove', move);
      ref.current?.style.removeProperty('--look-x');
      ref.current?.style.removeProperty('--look-y');
    };
  }, [follow, reduced]);
  return (
    <svg
      ref={ref}
      className={`eyes mood-${mood} tone-${tone}`}
      viewBox="11 -1 42 32"
      width={size}
      height={(size * 32) / 42}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <path className="eyes-head" d={BODY} />
      {mood === 'happy' ? (
        <path
          className="eyes-line"
          d="M20.4 17.4Q24.4 9.8 28.4 17.4M35.6 17.4Q39.6 9.8 43.6 17.4"
        />
      ) : mood === 'cross' ? (
        <path
          className="eyes-line"
          d="M21.6 11.6l5.6 5.6m0-5.6l-5.6 5.6M36.8 11.6l5.6 5.6m0-5.6l-5.6 5.6"
        />
      ) : mood === 'closed' ? (
        <path className="eyes-line" d="M20.6 16h7.6M35.8 16h7.6" />
      ) : (
        <g className="eyes-look">
          <g className="eyes-pair">
            <rect className="eye" x="20.4" y="8" width="8" height="12.8" rx="4" />
            <rect className="eye" x="35.6" y="8" width="8" height="12.8" rx="4" />
          </g>
        </g>
      )}
    </svg>
  );
}

export const CharacterEnvironment = createContext({ animate: true, active: true });

/** The same 3D model as the website, fitted to the existing character's footprint. */
export function Eyes({
  mood,
  tone,
  size = 24,
  follow = false,
  label,
  hop = 0,
  still = false,
}: {
  mood: Mood;
  tone: Tone | 'brand';
  size?: number;
  follow?: boolean;
  label?: string;
  hop?: number;
  still?: boolean;
}) {
  const environment = useContext(CharacterEnvironment);
  const reduced = useReducedMotion();
  const present = useIsPresent();
  const animate = environment.animate && !reduced && !still;
  const active = environment.active && present;
  const canvas = useRef<HTMLCanvasElement>(null);
  const handle = useRef<Handle | null>(null);
  const [renderer, setRenderer] = useState<'loading' | '3d' | 'fallback'>('loading');
  const latest = useRef<Options>({ tone, mood, follow, hop, animate, active, fps: 30 });
  latest.current = { tone, mood, follow, hop, animate, active, fps: 30 };
  const edge = Math.round(size / 0.82);
  useEffect(() => {
    let alive = true;
    setRenderer('loading');
    import('./mascot-renderer')
      .then(({ mount }) => {
        if (!alive || !canvas.current) return;
        handle.current = mount(
          canvas.current,
          edge,
          {
            ...latest.current,
            onReady: () => {
              if (alive) setRenderer('3d');
            },
            onError: () => {
              if (alive) setRenderer('fallback');
            },
          },
          size > 128 ? 1.5 : 2,
        );
        if (!handle.current) setRenderer('fallback');
      })
      .catch(() => {
        if (alive) setRenderer('fallback');
      });
    return () => {
      alive = false;
      handle.current?.dispose();
      handle.current = null;
    };
  }, [edge, size]);
  useEffect(() => {
    handle.current?.update(latest.current);
  }, [tone, mood, follow, hop, animate, active]);
  return (
    <span
      className={`glim-character tone-${tone}`}
      data-renderer={renderer}
      data-mood={mood}
      data-motion={animate}
      style={{ width: size, height: (size * 32) / 42 }}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <canvas ref={canvas} style={{ width: edge, height: edge }} />
      {renderer !== '3d' && (
        <FlatEyes mood={mood} tone={tone} size={size} follow={follow && animate} />
      )}
    </span>
  );
}

export function HelloCharacter({
  size,
  tone = 'brand',
  still = false,
}: {
  size: number;
  tone?: Tone | 'brand';
  still?: boolean;
}) {
  const [hello, setHello] = useState(false);
  const [hop, setHop] = useState(0);
  useEffect(() => {
    if (!hello) return;
    const timer = setTimeout(() => setHello(false), 1200);
    return () => clearTimeout(timer);
  }, [hello]);
  return (
    <button
      className={`mascot-big${hello ? ' is-hello' : ''}`}
      aria-label="Say hello to Glim"
      onClick={() => {
        setHello(true);
        setHop((value) => value + 1);
      }}
    >
      <Eyes
        mood={hello ? 'happy' : 'open'}
        tone={tone}
        size={size}
        follow
        hop={hop}
        still={still}
      />
      <span className="mascot-hello" aria-live="polite">
        {hello ? 'Hello.' : ''}
      </span>
    </button>
  );
}
