import { useState } from 'react';
import Button from '../components/ui/Button.jsx';
import EditableTitle from '../components/ui/EditableTitle.jsx';
import MediaCard from '../components/ui/MediaCard.jsx';
import Deck from '../components/ui/Deck.jsx';
import CardOverlay from '../components/ui/CardOverlay.jsx';
import { useLocalStore } from '../hooks/useLocalStore.js';
import { useDropTarget, DND_TYPE } from '../hooks/useDropTarget.js';
import { useMediaSrc } from '../hooks/useMediaSrc.js';
import { STORES } from '../db/localDb.js';
import { addToDeck, createDeckWithCards, renameDeck } from '../db/actions.js';
import './DeckPage.css';

function DraggableMedia({ item, serverUrl, onClick, onDropOnto }) {
  const { over, handlers } = useDropTarget((invId) => {
    if (invId !== item.inventory_id) onDropOnto(invId, item.inventory_id);
  });
  return (
    <div
      draggable
      onDragStart={(e) => e.dataTransfer.setData(DND_TYPE, String(item.inventory_id))}
      className={`drop-target ${over ? 'drop-target--over' : ''}`}
      {...handlers}
    >
      <MediaCard item={item} serverUrl={serverUrl} onClick={onClick} />
    </div>
  );
}

function ChildDeckCard({ deck, preview, serverUrl, onOpen, onDropCard }) {
  const { over, handlers } = useDropTarget((invId) => onDropCard(deck.id, invId));
  const previewUrl = useMediaSrc(serverUrl, preview, { thumbnail: true });
  return (
    <div className={`drop-target ${over ? 'drop-target--over' : ''}`} {...handlers}>
      <Deck
        count={deck.cardCount}
        onClick={onOpen}
        header={deck.name || 'Untitled deck'}
        art={
          previewUrl
            ? <img src={previewUrl} alt={deck.name} loading="lazy" draggable={false} crossOrigin="anonymous" />
            : <div style={{ width: '100%', height: '100%', background: '#000', display: 'flex',
                            alignItems: 'center', justifyContent: 'center', color: '#4b5563', fontSize: '2rem' }}>?</div>
        }
        footer={<span>{deck.cardCount} card{deck.cardCount !== 1 ? 's' : ''}</span>}
      />
    </div>
  );
}

export default function DeckPage({ deckId, server, onBack, onOpenDeck }) {
  const [selected, setSelected] = useState(null);
  const decks     = useLocalStore(STORES.DECKS);
  const deckCards = useLocalStore(STORES.DECK_CARDS);

  const deck = decks?.find(d => d.id === deckId);
  const children = (decks || []).filter(d => d.parent_id === deckId);

  /* Newest-first — same ordering the InventoryPage preview uses. */
  const cards = (deckCards?.filter(c => c.deck_id === deckId) || [])
    .sort((a, b) => (b.deck_card_id || 0) - (a.deck_card_id || 0));

  /* Preview row per child deck: most-recently-added card. */
  const previewByDeck = new Map();
  for (const dc of (deckCards || [])) {
    if (!dc.id || !dc.type) continue;
    const prev = previewByDeck.get(dc.deck_id);
    if (!prev || (dc.deck_card_id || 0) > (prev.deck_card_id || 0)) previewByDeck.set(dc.deck_id, dc);
  }

  const handleDropOnCard = (draggedId, targetId) =>
    createDeckWithCards('New Deck', [targetId, draggedId], deckId);
  const handleDropOnChildDeck = (childId, invId) => addToDeck(childId, invId);

  return (
    <div className="deck-page">
      <header className="deck-page__header">
        <div>
          {deck ? (
            <EditableTitle
              as="h1"
              className="deck-page__title"
              value={deck.name}
              placeholder="Untitled deck"
              onSave={(name) => renameDeck(deck.id, name)}
            />
          ) : (
            <h1 className="deck-page__title">Deck</h1>
          )}
          <p className="deck-page__count">
            {cards.length} card{cards.length !== 1 ? 's' : ''}
          </p>
        </div>
        <Button variant="ghost" onClick={onBack}>Back</Button>
      </header>

      <div className="deck-page__grid">
        {children.map(child => (
          <ChildDeckCard
            key={`d-${child.id}`}
            deck={child}
            preview={previewByDeck.get(child.id) || null}
            serverUrl={server.url}
            onOpen={() => onOpenDeck?.(child.id)}
            onDropCard={handleDropOnChildDeck}
          />
        ))}
        {cards.map(item => (
          <DraggableMedia
            key={item.inventory_id}
            item={item}
            serverUrl={server.url}
            onClick={() => setSelected(item)}
            onDropOnto={handleDropOnCard}
          />
        ))}
      </div>

      {selected && (
        <CardOverlay item={selected} serverUrl={server.url} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}
