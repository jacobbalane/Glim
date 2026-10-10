import { Eyes } from './Character';

export function GlimMark({ size = 18 }: { size?: number }) {
  return <Eyes size={size} mood="open" tone="brand" />;
}
