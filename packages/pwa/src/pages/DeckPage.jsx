import { useState } from 'react';
import Button from '../components/ui/Button.jsx';
import MediaCard from '../components/ui/MediaCard.jsx';
import CardOverlay from '../components/ui/CardOverlay.jsx';
import { useLocalStore } from '../hooks/useLocalStore.js';
import { STORES } from '../db/localDb.js';
import './DeckPage.css';

export default function DeckPage({ deckId, server, sync, onBack }) {
  const [selected, setSelected] = useState(null);
  const decks     = useLocalStore(STORES.DECKS,      sync?.phase);
  const deckCards = useLocalStore(STORES.DECK_CARDS, sync?.phase);

  const deck = decks?.find(d => !d.__meta && d.id === deckId);
  const cards = deckCards?.filter(c => c.deck_id === deckId) || [];

  return (
    <div className="deck-page">
      <header className="deck-page__header">
        <div>
          <h1 className="deck-page__title">{deck?.name || 'Deck'}</h1>
          <p className="deck-page__count">
            {cards.length} card{cards.length !== 1 ? 's' : ''}
          </p>
        </div>
        <Button variant="ghost" onClick={onBack}>Back</Button>
      </header>

      <div className="deck-page__grid">
        {cards.map(item => (
          <MediaCard
            key={item.inventory_id}
            item={item}
            serverUrl={server.url}
            onClick={() => setSelected(item)}
          />
        ))}
      </div>

      {selected && (
        <CardOverlay item={selected} serverUrl={server.url} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}
