import Card from './Card.jsx';

export default function ConsumableCard({
  title, subtitle, emoji, gradient = 'purple', borderColor, onClick, onDoubleClick,
}) {
  return (
    <Card
      borderColor={borderColor}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      header={title}
      art={
        <div className={`card__art--gradient-${gradient}`} style={{ width: '100%', height: '100%' }}>
          <span className="card__art-emoji">{emoji}</span>
        </div>
      }
      footer={subtitle && <p>{subtitle}</p>}
    />
  );
}
