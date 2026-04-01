/**
 * @file Consumable card — emoji art on a gradient background.
 *
 * Used for non-media inventory items like tickets.
 */

import Card from './Card.jsx';

export default function ConsumableCard({ cost, title, subtitle, emoji, icon, borderColor, bgGradient, className, onClick, onDoubleClick, children }) {
  return (
    <Card
      borderColor={borderColor}
      className={className}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      header={title}
      headerRight={cost != null ? <span className="text-purple-300 text-[10px] font-medium">{cost}</span> : undefined}
      art={
        <div className={`w-full h-full ${bgGradient} flex items-center justify-center`}>
          {icon || <span className="text-5xl select-none">{emoji}</span>}
        </div>
      }
      footer={subtitle && <p className="text-gray-400 text-[10px]">{subtitle}</p>}
    >
      {children}
    </Card>
  );
}
