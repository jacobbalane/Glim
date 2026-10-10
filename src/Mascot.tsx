import { HelloCharacter } from './Character';

export default function Mascot({
  small = false,
  still = false,
}: {
  small?: boolean;
  still?: boolean;
}) {
  return <HelloCharacter size={small ? 60 : 160} still={still} />;
}
