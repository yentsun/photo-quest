/**
 * @file Consumable card — emoji art on a gradient background.
 *
 * Used for non-media inventory items like tickets.
 */

import Card from './Card.jsx';

export default function ConsumableCard({ label, title, subtitle, emoji, icon, borderColor, bgGradient, className, onClick, onDoubleClick, children }) {
  return (
    <Card
      borderColor={borderColor}
      className={className}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      header={<span className="text-[10px] uppercase tracking-wide opacity-70">{label}</span>}
      art={
        <div className={`w-full h-full ${bgGradient} flex items-center justify-center`}>
          {icon || <span className="text-5xl select-none">{emoji}</span>}
        </div>
      }
      footer={
        <>
          <p className="text-white text-xs font-medium">{title}</p>
          {subtitle && <p className="text-gray-400 text-[10px]">{subtitle}</p>}
        </>
      }
    >
      {children}
    </Card>
  );
}
