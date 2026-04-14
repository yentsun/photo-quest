import { useRef, useState } from 'react';
import { CARD_TYPE, MARKET_PRICES, MEDIA_TYPE, words } from '@photo-quest/shared';
import Button from '../components/ui/Button.jsx';
import EmptyState from '../components/EmptyState.jsx';
import MediaCard from '../components/ui/MediaCard.jsx';
import ConsumableCard from '../components/ui/ConsumableCard.jsx';
import Deck from '../components/ui/Deck.jsx';
import Spinner from '../components/ui/Spinner.jsx';
import CardOverlay from '../components/ui/CardOverlay.jsx';
import { useLocalStore } from '../hooks/useLocalStore.js';
import { STORES } from '../db/localDb.js';
import { addToDeck, startQuest } from '../db/actions.js';
import './InventoryPage.css';

const DND_TYPE = 'application/x-inventory-id';

function useDropTarget(onDropId) {
  const [over, setOver] = useState(false);
  const depth = useRef(0);
  const handlers = {
    onDragOver:  (e) => { if (e.dataTransfer.types.includes(DND_TYPE)) e.preventDefault(); },
    onDragEnter: (e) => { if (!e.dataTransfer.types.includes(DND_TYPE)) return; e.preventDefault(); depth.current++; setOver(true); },
    onDragLeave: () => { depth.current--; if (depth.current <= 0) { depth.current = 0; setOver(false); } },
    onDrop:      (e) => {
      e.preventDefault();
      depth.current = 0; setOver(false);
      const id = Number(e.dataTransfer.getData(DND_TYPE));
      if (id) onDropId(id);
    },
  };
  return { over, handlers };
}

function DeckCard({ deck, serverUrl, onOpen, onDropCard }) {
  const { over, handlers } = useDropTarget((invId) => onDropCard(deck.id, invId));
  const previewUrl = deck.preview
    ? (deck.preview.type === MEDIA_TYPE.IMAGE
        ? `${serverUrl}/image/${deck.preview.id}`
        : `${serverUrl}/stream/${deck.preview.id}`)
    : null;

  return (
    <div className={`drop-target ${over ? 'drop-target--over' : ''}`} {...handlers}>
      <Deck
        count={deck.cardCount}
        onClick={onOpen}
        header={deck.name || 'Untitled deck'}
        art={
          previewUrl
            ? <img src={previewUrl} alt={deck.name} loading="lazy" draggable={false} />
            : <div style={{ width: '100%', height: '100%', background: '#000', display: 'flex',
                            alignItems: 'center', justifyContent: 'center', color: '#4b5563', fontSize: '2rem' }}>?</div>
        }
        footer={<span>{deck.cardCount} card{deck.cardCount !== 1 ? 's' : ''}</span>}
      />
    </div>
  );
}

function DraggableMedia({ item, serverUrl, onClick }) {
  return (
    <div
      draggable
      onDragStart={(e) => e.dataTransfer.setData(DND_TYPE, String(item.inventory_id))}
    >
      <MediaCard item={item} serverUrl={serverUrl} onClick={onClick} />
    </div>
  );
}

function InventoryItem({ item, serverUrl, onClick }) {
  if (item.card_type === CARD_TYPE.MEDIA) {
    return <DraggableMedia item={item} serverUrl={serverUrl} onClick={onClick} />;
  }
  if (item.card_type === CARD_TYPE.MEMORY_TICKET) {
    return <ConsumableCard title="Memory Game" subtitle="Play to earn dust" emoji="🎟️" gradient="purple" />;
  }
  return null;
}

const QUEST_ICON_PATH = 'M158,885V812H0v73Zm1099,0V812H300v73Zm300,0V812H1399v73ZM1240,394a238.81563,238.81563,0,0,1,14.5,24q7.5,14,8.5,21,2.00005,12-5.5,32T1240,498q-51.99995,30-147,28T935,498q-26-11-45.5-37.5T870,393q0-64,51-130L779,0,636,263l13,19q13,18,25.5,50.5T687,393q0,41-19.5,67.5T622,498q-63,26-158,28T317,498q-10-7-18-27t-6-32q3-15,31-56L239,239,199,391,300,763h957l101-372-40-152-85,144Z';

function QuestDecksStack({ count, onDoubleClick }) {
  return (
    <Deck
      count={count}
      onDoubleClick={onDoubleClick}
      header="Quest Decks"
      headerRight={
        <span style={{ color: '#d8b4fe' }}>{MARKET_PRICES.questDeck} {words.dustSymbol}</span>
      }
      borderColor="rgba(180, 83, 9, 0.6)"
      art={
        <div className="card__art--gradient-quest" style={{ width: '100%', height: '100%' }}>
          <svg
            viewBox="0 -336 1557 1557"
            fill="currentColor"
            style={{ width: '60%', height: '60%', color: '#fde68a', opacity: 0.85 }}
          >
            <path d={QUEST_ICON_PATH} />
          </svg>
        </div>
      }
      footer={<span>{count} deck{count !== 1 ? 's' : ''}</span>}
    />
  );
}

export default function InventoryPage({ onLookForServer, server, sync, onOpenDeck, onStartQuest }) {
  const [version, setVersion] = useState(0);
  const [selectedId, setSelectedId] = useState(null);
  const refreshKey = `${sync?.phase}-${version}`;
  const items      = useLocalStore(STORES.CARDS,      refreshKey);
  const decks      = useLocalStore(STORES.DECKS,      refreshKey);
  const deckCards  = useLocalStore(STORES.DECK_CARDS, refreshKey);

  const handleDropCard = async (deckId, invId) => {
    await addToDeck(deckId, invId);
    setVersion(v => v + 1);
  };

  const handleStartQuest = async () => {
    try {
      const deckId = await startQuest();
      setVersion(v => v + 1);
      onStartQuest?.(deckId);
    } catch (err) {
      console.warn(err.message);
    }
  };

  if (!server) {
    return (
      <EmptyState
        icon="📷"
        title="Your inventory is empty"
        text="Connect to your server to import media and start collecting cards."
        action={
          <Button variant="primary" size="lg" onClick={onLookForServer}>
            Look for server
          </Button>
        }
      />
    );
  }

  if (items === null || decks === null || deckCards === null) {
    return <Spinner label="Loading inventory…" />;
  }

  const groupedIds = new Set(deckCards.map(dc => dc.inventory_id));
  const ungrouped = items.filter(it => !groupedIds.has(it.inventory_id));
  const questDecks = ungrouped.filter(it => it.card_type === CARD_TYPE.QUEST_DECK);
  const otherItems = ungrouped.filter(it => it.card_type !== CARD_TYPE.QUEST_DECK);

  if (!decks.length && !ungrouped.length) {
    if (sync?.phase === 'idle' || sync?.phase === 'syncing') {
      return <Spinner label="Loading inventory…" />;
    }
    return (
      <EmptyState
        icon="📷"
        title="Your inventory is empty"
        text="Scan media on your server to start collecting cards."
      />
    );
  }

  return (
    <div className="inventory">
      {questDecks.length > 0 && (
        <QuestDecksStack count={questDecks.length} onDoubleClick={handleStartQuest} />
      )}
      {decks.map(deck => (
        <DeckCard
          key={`d-${deck.id}`}
          deck={deck}
          serverUrl={server.url}
          onOpen={() => onOpenDeck(deck.id)}
          onDropCard={handleDropCard}
        />
      ))}
      {otherItems.map(item => (
        <InventoryItem
          key={`i-${item.inventory_id}`}
          item={item}
          serverUrl={server.url}
          onClick={() => setSelectedId(item.inventory_id)}
        />
      ))}
      {selectedId != null && (() => {
        const live = items.find(it => it.inventory_id === selectedId);
        if (!live) return null;
        return (
          <CardOverlay item={live} serverUrl={server.url} onClose={() => setSelectedId(null)} />
        );
      })()}
    </div>
  );
}
