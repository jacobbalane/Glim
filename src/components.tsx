import { useId, type ComponentProps } from 'react';
import type { Provider } from './types';
import StarBorder from './react-bits/StarBorder';

export function AccentButton({ children, className = '', ...props }: ComponentProps<'button'>) {
  return (
    <StarBorder
      {...props}
      className={`primary-button ${className}`}
      color="#a78bfa"
      speed="10s"
      backgroundColor="#f2f2f4"
      textColor="#161618"
      borderColor="transparent"
    >
      {children}
    </StarBorder>
  );
}

export function GlimMark({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 32" aria-hidden="true">
      <path
        fill="currentColor"
        fillRule="evenodd"
        d="M4 6H44V13C44 22.2 37.4 27 24 27S4 22.2 4 13V6ZM20 15A2 2 0 1 0 16 15A2 2 0 1 0 20 15ZM32 15A2 2 0 1 0 28 15A2 2 0 1 0 32 15Z"
      />
    </svg>
  );
}
export function AgentMark({ provider, size = 24 }: { provider: Provider; size?: number }) {
  return (
    <img
      className="agent-mark"
      src={`/providers/${provider}.${provider === 'claude' ? 'svg' : 'png'}`}
      width={size}
      height={size}
      alt=""
      aria-hidden="true"
      draggable={false}
    />
  );
}
export function AgentTile({ provider, small = false }: { provider: Provider; small?: boolean }) {
  return (
    <span className={`agent-tile ${provider} ${small ? 'small' : ''}`}>
      <AgentMark provider={provider} size={small ? 22 : 43} />
    </span>
  );
}
export function Toggle({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  description?: string;
}) {
  const id = useId();
  return (
    <div className="setting-row">
      <div>
        <label htmlFor={id}>{label}</label>
        {description && <p>{description}</p>}
      </div>
      <button
        id={id}
        role="switch"
        aria-checked={checked}
        aria-label={label}
        className={`toggle ${checked ? 'on' : ''}`}
        onClick={() => onChange(!checked)}
      >
        <span />
      </button>
    </div>
  );
}
