import './Card.css';

export default function Card({
  header, headerRight, art, footer, size = 'normal',
  borderColor, className = '', onClick, onDoubleClick, children,
}) {
  const clickable = !!(onClick || onDoubleClick);
  return (
    <div
      className={`card card--${size} ${clickable ? 'card--clickable' : ''} ${className}`}
      style={borderColor ? { borderColor } : undefined}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
    >
      <div className="card__header">
        <span className={`card__header-title ${headerRight ? 'card__header-title--narrow' : ''}`}>
          {header}
        </span>
        {headerRight && <span className="card__header-right">{headerRight}</span>}
      </div>
      <div className="card__art-wrap">
        <div className="card__art">{art}</div>
      </div>
      <div className="card__footer">{footer}</div>
      {children}
    </div>
  );
}
