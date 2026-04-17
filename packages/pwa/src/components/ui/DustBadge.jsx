import { words } from '@photo-quest/shared';
import './DustBadge.css';

export default function DustBadge({ dust }) {
  return (
    <span className="dust-badge">
      <span className="dust-badge__symbol">{words.dustSymbol}</span>
      {dust}
    </span>
  );
}
