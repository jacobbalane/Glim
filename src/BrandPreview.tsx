import { GlimMark } from './components';
import Mascot from './Mascot';
import { designMotion } from './api';
import type { PreviewScene } from './design-preview';

export default function BrandPreview({ variant }: { variant: PreviewScene['brand'] }) {
  return (
    <main className="brand-preview" data-variant={variant} data-preview-surface="brand">
      {variant === 'icon' ? (
        <img src="/glim.svg" width="128" height="128" alt="Glim application icon" />
      ) : variant === 'mascot' ? (
        <Mascot still={!designMotion} />
      ) : (
        <GlimMark size={160} />
      )}
    </main>
  );
}
