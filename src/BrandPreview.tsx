import { Eyes, HelloCharacter } from './Character';
import { designMotion } from './api';
import type { PreviewScene } from './design-preview';

export default function BrandPreview({ variant }: { variant: PreviewScene['brand'] }) {
  return (
    <main className="brand-preview" data-variant={variant} data-preview-surface="brand">
      {variant === 'icon' ? (
        <img src="/glim.png" width="128" height="128" alt="Glim application icon" />
      ) : variant === 'mascot' ? (
        <HelloCharacter size={160} still={!designMotion} />
      ) : (
        <Eyes size={160} tone="brand" mood="open" still={!designMotion} />
      )}
    </main>
  );
}
