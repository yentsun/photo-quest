/**
 * @file Base card frame — header strip, art area, footer strip.
 *
 * Accepts a `size` prop: "micro", "normal" (default), "large".
 * All inventory/market cards share this structure.
 */

import { CARD_SIZES } from './cardSizes.js';

export default function Card({ size = 'normal', header, art, footer, borderColor = 'border-gray-700', className, onClick, onDoubleClick, children }) {
  const s = CARD_SIZES[size];

  return (
    <div className={className} onClick={onClick} onDoubleClick={onDoubleClick}>
      <div className={`${s.rounding} bg-gray-900 border ${borderColor} shadow-[0_4px_16px_rgba(0,0,0,0.4)] overflow-hidden transition-all
        ${onClick || onDoubleClick ? 'cursor-pointer hover:shadow-[0_8px_32px_rgba(0,0,0,0.5)]' : ''}`}>
        <div className={`flex items-center justify-between ${s.headerPadding} border-b ${borderColor}`}>
          {header}
        </div>
        <div className={s.artPadding}>
          <div className={`relative ${s.art} rounded-lg overflow-hidden`}>
            {art}
          </div>
        </div>
        <div className={s.footerPadding}>
          {footer}
        </div>
      </div>
      {children}
    </div>
  );
}
