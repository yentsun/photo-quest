/**
 * @file Deck — wraps any card with stacked shadow layers.
 *
 * Can wrap a Card via header/art/footer props, or wrap arbitrary
 * card content via the `card` prop (e.g. a ConsumableCard or TicketCard).
 */

import Card from './Card.jsx';
import { CARD_SIZES } from './cardSizes.js';

export default function Deck({ size = 'normal', count = 0, card, className, onClick, header, headerRight, art, footer, borderColor, children }) {
  return (
    <div className={`${className || ''} ${onClick ? 'cursor-pointer' : ''}`} onClick={onClick} onDragOver={(e) => e.preventDefault()}>
      <div className="relative" onDragOver={(e) => e.preventDefault()}>
        {count >= 3 && (
          <div className={`absolute inset-0 ${CARD_SIZES[size].rounding} bg-gray-700 border border-gray-600 translate-x-2 translate-y-2 pointer-events-none`} />
        )}
        {count >= 2 && (
          <div className={`absolute inset-0 ${CARD_SIZES[size].rounding} bg-gray-800 border border-gray-600 translate-x-1 translate-y-1 pointer-events-none`} />
        )}
        <div className="relative">
          {card || <Card size={size} header={header} headerRight={headerRight} art={art} footer={footer} borderColor={borderColor} />}
        </div>
      </div>
      {children}
    </div>
  );
}
