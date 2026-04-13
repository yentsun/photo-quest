import Card from './Card.jsx';

export default function Deck({ count = 0, header, headerRight, art, footer, onClick }) {
  return (
    <div className="deck" onClick={onClick}>
      {count >= 3 && <div className="deck__layer deck__layer--back" />}
      {count >= 2 && <div className="deck__layer deck__layer--mid" />}
      <div className="deck__inner">
        <Card header={header} headerRight={headerRight} art={art} footer={footer} onClick={onClick} />
      </div>
    </div>
  );
}
