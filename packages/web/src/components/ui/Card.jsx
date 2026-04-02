/**
 * @file Base card frame — header strip, art area, footer strip.
 *
 * Accepts a `size` prop: "small", "normal" (default), "large".
 * All inventory/market cards share this structure.
 */

import { CARD_SIZES } from './cardSizes.js';

const fadeMask = { maskImage: 'linear-gradient(to right, black 75%, transparent)', WebkitMaskImage: 'linear-gradient(to right, black 75%, transparent)' };

export default function Card({ size = 'normal', header, headerRight, art, footer, borderColor = 'border-gray-700', className, onClick, onDoubleClick, children }) {
  const s = CARD_SIZES[size];

  return (
    <div className={`${s.width} ${className || ''}`} onClick={onClick} onDoubleClick={onDoubleClick}>
      <div className={`${s.rounding} bg-gray-900 border ${borderColor} shadow-[0_4px_16px_rgba(0,0,0,0.4)] overflow-hidden transition-all
        ${onClick || onDoubleClick ? 'cursor-pointer hover:shadow-[0_8px_32px_rgba(0,0,0,0.5)]' : ''}`}>
        <div className={`flex items-center ${s.headerPadding} border-b ${borderColor} text-white whitespace-nowrap`}>
          <span className={`${headerRight ? 'w-[80%]' : 'w-full'} overflow-hidden ${s.headerText} uppercase tracking-wide font-medium`} style={fadeMask}>{header}</span>
          {headerRight && <span className={`w-[20%] text-right ${s.headerText}`}>{headerRight}</span>}
        </div>
        <div className={s.artPadding}>
          <div className={`relative ${s.art} rounded-lg overflow-hidden`}>
            {art}
          </div>
        </div>
        <div className={`${s.footerPadding} ${s.footerHeight} ${s.footerText} flex items-center`}>
          {footer}
        </div>
      </div>
      {children}
    </div>
  );
}
