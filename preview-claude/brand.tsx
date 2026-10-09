// Claude's brand proposal for Glim: one character drawn from the island's pod.
// Preview-only. Every shape comes from podPath(), so the logo, the island's status light,
// the app icon and the installer art always agree.
import { useEffect, useId, useRef, useState } from 'react';
import { useReducedMotion } from 'motion/react';

export type Tone = 'active' | 'attention' | 'error' | 'success' | 'done' | 'calm' | 'off';
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
export function Eyes({
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
    return () => window.removeEventListener('pointermove', move);
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

/** The primary logo: always Glim indigo with white eyes. Only the eyes follow the state. */
export function Mark({
  size = 32,
  label,
  mood = 'open',
}: {
  size?: number;
  label?: string;
  mood?: Mood;
}) {
  return <Eyes size={size} label={label} mood={mood} tone="brand" />;
}

/** Island states as the logo's eyes show them. The logo itself never changes color. */
export const LOGO_STATES: [string, Mood][] = [
  ['Ready', 'open'],
  ['Working', 'scan'],
  ['Needs you', 'wide'],
  ['Your turn', 'happy'],
  ['Error', 'cross'],
  ['Interrupted', 'half'],
  ['Paused', 'closed'],
];

export function LogoStage() {
  const [index, setIndex] = useState(1);
  const [, mood] = LOGO_STATES[index];
  return (
    <div className="logo-stage">
      <div className="brand-frame lockups">
        <div className="lockup">
          <Mark size={150} mood={mood} label="Glim logo" />
          <span>Glim</span>
        </div>
        <div className="lockup dark">
          <Mark size={150} mood={mood} label="Glim logo on dark" />
          <span>Glim</span>
        </div>
      </div>
      <div className="pseg" role="group" aria-label="Logo state">
        {LOGO_STATES.map(([label], i) => (
          <button key={label} aria-pressed={i === index} onClick={() => setIndex(i)}>
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}

const ICON_TONES = {
  brand: GLIM_INDIGO,
  attention: '#ffc53d',
  success: '#3ddc84',
  error: '#ff6a5f',
};
type IconTone = keyof typeof ICON_TONES;

/**
 * The app icon: the primary logo centered on a slice of desktop. Small sizes get a larger
 * character with bigger eyes. The tray swaps the indigo for a state color when it matters.
 */
export function AppIcon({ size = 64, tone = 'brand' }: { size?: number; tone?: IconTone }) {
  const id = useId().replace(/:/g, '');
  const small = size <= 32;
  const w = small ? 168 : 132;
  const shape = glimPath(128, 128 - 0.35 * w, w, small ? 1.1 : 1);
  const shadow = small ? undefined : { filter: 'drop-shadow(0 8px 10px rgba(9,9,11,.22))' };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 256 256"
      role="img"
      aria-label={`Glim app icon, ${size} pixels${tone === 'brand' ? '' : `, ${tone}`}`}
    >
      <defs>
        <linearGradient id={`${id}-desk`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fdfdfe" />
          <stop offset="1" stopColor="#d6d9e1" />
        </linearGradient>
        <clipPath id={`${id}-tile`}>
          <rect width="256" height="256" rx={small ? 48 : 56} />
        </clipPath>
      </defs>
      <g clipPath={`url(#${id}-tile)`}>
        <rect width="256" height="256" fill={`url(#${id}-desk)`} />
        <path d={shape.body} fill={ICON_TONES[tone]} style={shadow} />
        <path d={shape.eyes} fill={tone === 'brand' ? '#fff' : '#000'} />
      </g>
      <rect
        x="0.75"
        y="0.75"
        width="254.5"
        height="254.5"
        rx={small ? 47.5 : 55.5}
        fill="none"
        stroke="rgba(24,24,27,.14)"
        strokeWidth="1.5"
      />
    </svg>
  );
}

// Installer bitmaps at their NSIS sizes (sidebar 164×314, header 150×57).
export function SidebarArt({ happy = false }: { happy?: boolean }) {
  const id = useId().replace(/:/g, '');
  const w = 84;
  const shape = glimPath(82, 128, w);
  return (
    <svg width="164" height="314" viewBox="0 0 164 314" aria-hidden="true">
      <defs>
        <linearGradient id={`${id}-desk`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fdfdfe" />
          <stop offset="1" stopColor="#d6d9e1" />
        </linearGradient>
      </defs>
      <rect width="164" height="314" fill={`url(#${id}-desk)`} />
      <path
        d={shape.body}
        fill={GLIM_INDIGO}
        style={{ filter: 'drop-shadow(0 6px 8px rgba(9,9,11,.2))' }}
      />
      {happy ? (
        <path
          d={shape.happy}
          fill="none"
          stroke="#fff"
          strokeWidth={0.075 * w}
          strokeLinecap="round"
        />
      ) : (
        <path d={shape.eyes} fill="#fff" />
      )}
    </svg>
  );
}
export function HeaderArt() {
  const shape = glimPath(110, 13.5, 40);
  return (
    <svg width="150" height="57" viewBox="0 0 150 57" aria-hidden="true">
      <rect width="150" height="57" fill="#fff" />
      <path d={shape.body} fill={GLIM_INDIGO} />
      <path d={shape.eyes} fill="#fff" />
    </svg>
  );
}

/* A playground for the character: follows the pointer, says hello, wears every mood. */
const MOODS: [string, Mood, Tone | 'brand'][] = [
  ['Hello', 'open', 'brand'],
  ['Working', 'scan', 'active'],
  ['Needs you', 'wide', 'attention'],
  ['Your turn', 'happy', 'success'],
  ['Error', 'cross', 'error'],
  ['Interrupted', 'half', 'calm'],
  ['Paused', 'closed', 'calm'],
];
export function MascotStage() {
  const [index, setIndex] = useState(0);
  const [hello, setHello] = useState(false);
  useEffect(() => {
    if (!hello) return;
    const timer = setTimeout(() => setHello(false), 1200);
    return () => clearTimeout(timer);
  }, [hello]);
  const [, mood, tone] = MOODS[index];
  return (
    <div className="gl mascot-stage">
      <button
        className={`mascot-big${hello ? ' is-hello' : ''}`}
        aria-label="Say hello to Glim"
        onClick={() => setHello(true)}
      >
        <Eyes mood={hello ? 'happy' : mood} tone={hello ? 'brand' : tone} size={224} follow />
        <span className="mascot-hello" aria-live="polite">
          {hello ? 'Hello.' : ''}
        </span>
      </button>
      <div className="seg mascot-moods" role="group" aria-label="Mood">
        {MOODS.map(([label], i) => (
          <button key={label} aria-pressed={i === index} onClick={() => setIndex(i)}>
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
export function MoodStrip() {
  return (
    <ul className="gl mood-strip">
      {MOODS.slice(1).map(([label, mood, tone]) => (
        <li key={label}>
          <Eyes mood={mood} tone={tone} size={62} />
          <span>{label}</span>
        </li>
      ))}
    </ul>
  );
}
