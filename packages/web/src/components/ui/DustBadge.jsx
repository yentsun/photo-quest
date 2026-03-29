/**
 * @file Dust balance badge — shows the player's magic dust with the Đ symbol.
 */

import { words } from '@photo-quest/shared';

export default function DustBadge({ dust }) {
  return (
    <span className="inline-flex items-center gap-1 px-3 py-1 bg-purple-900/50 border border-purple-600/50 rounded-full text-purple-200 font-semibold text-sm">
      <span className="text-yellow-400">{words.dustSymbol}</span>
      {dust}
    </span>
  );
}
