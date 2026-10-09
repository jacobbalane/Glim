import type { CSSProperties } from 'react';
import CrystalizedBall from './react-bits/CrystalizedBall';

export default function WorkingIndicator({ color, reduced }: { color: string; reduced: boolean }) {
  return (
    <span className="working-indicator" style={{ '--working-color': color } as CSSProperties}>
      <CrystalizedBall
        color={color}
        size={0.7}
        preset="ember"
        particleCount={400}
        strands={3}
        sparks={0.2}
        haze={0}
        glow={0.5}
        speed={0.5}
        dustSpeed={0.4}
        interactive={!reduced}
        hoverStrength={0.25}
        intro={false}
        paused={reduced}
      />
    </span>
  );
}
