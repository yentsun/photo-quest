/**
 * @file Base card frame — header strip, art area, footer strip.
 *
 * All inventory/market cards share this structure. Subcomponents:
 *   MediaCard      — image/video thumbnail with infusion badge
 *   ConsumableCard — emoji art with gradient background
 */

export default function Card({ header, art, footer, borderColor = 'border-gray-700', className, onClick, onDoubleClick, children }) {
  return (
    <div className={className} onClick={onClick} onDoubleClick={onDoubleClick}>
      <div className={`rounded-2xl bg-gray-900 border ${borderColor} shadow-[0_4px_16px_rgba(0,0,0,0.4)] overflow-hidden transition-all
        ${onClick || onDoubleClick ? 'cursor-pointer hover:shadow-[0_8px_32px_rgba(0,0,0,0.5)]' : ''}`}>
        <div className={`flex items-center justify-between px-3 py-1.5 border-b ${borderColor}`}>
          {header}
        </div>
        <div className="p-2 pb-0">
          <div className="relative aspect-[5/7] rounded-lg overflow-hidden">
            {art}
          </div>
        </div>
        <div className="px-3 py-2">
          {footer}
        </div>
      </div>
      {children}
    </div>
  );
}
