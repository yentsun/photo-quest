import Card from './Card.jsx';

export default function Deck({ count = 0, size = 'normal', header, headerRight, art, footer, borderColor, onClick, onDoubleClick }) {
  return (
    <div className="deck" onClick={onClick} onDoubleClick={onDoubleClick}>
      {count >= 3 && <div className="deck__layer deck__layer--back" />}
      {count >= 2 && <div className="deck__layer deck__layer--mid" />}
      <div className="deck__inner">
        <Card
          size={size}
          header={header}
          headerRight={headerRight}
          art={art}
          footer={footer}
          borderColor={borderColor}
          onClick={onClick}
          onDoubleClick={onDoubleClick}
        />
      </div>
    </div>
  );
}
