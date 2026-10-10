import { useId, type ReactNode } from 'react';
import type { Provider } from './types';
export function Logo({ provider, size = 18 }: { provider: Provider; size?: number }) {
  // Codex artwork ships on black; a luminance mask keeps only the knot on any surface.
  return provider === 'claude' ? (
    <img
      className="logo"
      src="/providers/claude.svg"
      width={size}
      height={size}
      alt=""
      draggable={false}
    />
  ) : (
    <span className="logo logo-codex" style={{ width: size, height: size }} aria-hidden="true" />
  );
}

export function IconButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick?: () => void;
  children: ReactNode;
}) {
  return (
    <button className="icon-btn" aria-label={label} title={label} onClick={onClick}>
      {children}
    </button>
  );
}

export function Meter({
  label,
  value,
  note,
  large = false,
}: {
  label: string;
  value: number | null;
  note?: string;
  large?: boolean;
}) {
  const fill =
    value === null ? 'none' : value >= 90 ? 'error' : value >= 75 ? 'attention' : 'plain';
  return (
    <div className={`meter${large ? ' large' : ''}`}>
      <div className="meter-row">
        <span>{label}</span>
        {value === null ? (
          <b className="na">Unavailable</b>
        ) : (
          <b className="num">{Math.round(value)}%</b>
        )}
      </div>
      <div
        className="track"
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={value === null ? undefined : Math.round(value)}
      >
        <i className={`fill-${fill}`} style={{ transform: `scaleX(${(value ?? 0) / 100})` }} />
      </div>
      {note && <small>{note}</small>}
    </div>
  );
}

export function Switch({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  const id = useId();
  return (
    <div className="field">
      <label className="field-label" htmlFor={id}>
        {label}
      </label>
      <button
        id={id}
        className="switch"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
      >
        <i />
      </button>
    </div>
  );
}

export function Segmented<T extends string | number>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: [T, string][];
  onChange: (value: T) => void;
}) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {options.map(([option, text]) => (
        <button key={option} aria-pressed={option === value} onClick={() => onChange(option)}>
          {text}
        </button>
      ))}
    </div>
  );
}
