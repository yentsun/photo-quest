/**
 * @file Deck — a Card with stacked shadow layers behind it.
 *
 * Wraps any Card variant with offset shadow layers to give
 * a stacked-cards appearance.
 */

import Card from './Card.jsx';

export default function Deck({ count = 0, className, onClick, header, art, footer, borderColor, children }) {
  return (
    <div className={`${className || ''} ${onClick ? 'cursor-pointer' : ''}`} onClick={onClick}>
      <div className="relative">
        {count >= 3 && (
          <div className="absolute inset-0 rounded-2xl bg-gray-700 border border-gray-600 translate-x-2 translate-y-2" />
        )}
        {count >= 2 && (
          <div className="absolute inset-0 rounded-2xl bg-gray-800 border border-gray-600 translate-x-1 translate-y-1" />
        )}
        <Card header={header} art={art} footer={footer} borderColor={borderColor} className="relative" />
      </div>
      {children}
    </div>
  );
}
