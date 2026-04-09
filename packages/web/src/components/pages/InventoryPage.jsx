/**
 * @file Inventory page - cards with drag & drop decks.
 */

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSlideshow } from '../../contexts/SlideshowContext.jsx';
import { MEDIA_TYPE, CARD_TYPE, MARKET_PRICES, words, clientRoutes } from '@photo-quest/shared';
import {
  destroyInventoryItem, sellInventoryItem, getMediaUrl, getImageUrl,
  createDeck, renameDeck, deleteDeck, addToDeck,
} from '../../utils/api.js';
import { useInventory, useDecks } from '../../db/hooks.js';
import { syncAll, syncTable } from '../../db/sync.js';
import { EmptyState } from '../layout/index.js';
import { showToast } from '../ToasterMessage.jsx';
import { Button, CARD_GRID, IconButton, Icon, Input, ConfirmModal, MediaCard, CardOverlay, ConsumableCard, TicketCard, Deck, DeckDropdown } from '../ui/index.js';
import { ICON_CLASS } from '../ui/Icon.jsx';
import { notifyDustChanged } from '../../utils/events.js';

/* ── Inventory media card (wraps MediaCard with drag & drop + actions) ── */

function InventoryMediaCard({ item, onClick, onDrop }) {
  const [dragOver, setDragOver] = useState(false);
  const dragCount = useRef(0);

  return (
    <div
      className={`${dragOver ? 'ring-2 ring-blue-400 rounded-2xl' : ''}`}
      draggable
      onDragStart={(e) => { e.dataTransfer.setData('text/plain', String(item.inventory_id)); }}
      onDragOver={(e) => { e.preventDefault(); }}
      onDragEnter={(e) => { e.preventDefault(); dragCount.current++; setDragOver(true); }}
      onDragLeave={() => { dragCount.current--; if (dragCount.current === 0) setDragOver(false); }}
      onDrop={(e) => { e.preventDefault(); dragCount.current = 0; setDragOver(false); onDrop?.(e, item); }}
    >
      <MediaCard
        item={item}
        onClick={() => onClick?.(item)}
      />
    </div>
  );
}

/* ── User deck (stacked card with rename/delete) ── */

function UserDeck({ deck, onOpen, onRename, onDelete, onDrop }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(deck.name);
  const [dragOver, setDragOver] = useState(false);
  const dragCount = useRef(0);

  const handleSave = () => {
    setEditing(false);
    if (name.trim() && name !== deck.name) onRename(deck.id, name.trim());
  };

  const previewUrl = deck.preview
    ? (deck.preview.type === MEDIA_TYPE.IMAGE ? getImageUrl(deck.preview.id) : getMediaUrl(deck.preview))
    : null;

  return (
    <div
      className={`group ${dragOver ? 'ring-2 ring-blue-400 rounded-2xl' : ''}`}
      onDragOver={(e) => { e.preventDefault(); }}
      onDragEnter={(e) => { e.preventDefault(); dragCount.current++; setDragOver(true); }}
      onDragLeave={() => { dragCount.current--; if (dragCount.current === 0) setDragOver(false); }}
      onDrop={(e) => { e.preventDefault(); dragCount.current = 0; setDragOver(false); onDrop(e, deck.id); }}
    >
      <Deck
        count={deck.cardCount}
        onClick={() => !editing && onOpen(deck.id)}
        header={
          editing ? (
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={handleSave}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); }}
              autoFocus
              onClick={(e) => e.stopPropagation()}
              className="text-xs w-full"
            />
          ) : deck.name
        }
        art={
          previewUrl ? (
            <img src={previewUrl} alt={deck.name} className="w-full h-full object-cover" loading="lazy" draggable={false} />
          ) : (
            <div className="w-full h-full bg-black flex items-center justify-center text-gray-600 text-3xl">?</div>
          )
        }
        footer={
          <span className="text-gray-500 text-[10px]">{deck.cardCount} card{deck.cardCount !== 1 ? 's' : ''}</span>
        }
      />
    </div>
  );
}

/* ── Main page ── */

export default function InventoryPage() {
  const navigate = useNavigate();
  const slideshow = useSlideshow();
  const pendingShuffle = useRef(false);

  useEffect(() => { slideshow.stop(); }, []);  // eslint-disable-line react-hooks/exhaustive-deps

  const { items } = useInventory();
  const { piles: decks, groupedIds } = useDecks();
  const [selectedItem, setSelectedItem] = useState(null);
  const [confirmAction, setConfirmAction] = useState(null);

  const closeOverlay = useCallback(() => { setSelectedItem(null); syncAll(); }, []);

  const openDeck = (deckId) => {
    navigate(`/deck/${deckId}`);
  };

  const handleCardClick = (item) => setSelectedItem(item);

  const handleTicketClick = (item) => {
    navigate(clientRoutes.memoryGame, { state: { ticketId: item.inventory_id } });
  };

  const handleDeckClick = (item) => {
    navigate(clientRoutes.quest, { state: { deckId: item.ref_id } });
  };

  const handleSell = (item) => {
    const infusion = item.infusion || 0;
    const sellReward = infusion;
    setConfirmAction({
      message: sellReward > 0
        ? `Sell this card back to library?`
        : 'Return this card to library for free?',
      reward: `+${sellReward} ${words.dustSymbol}`,
      confirmLabel: words.sell,
      onConfirm: async () => {
        try {
          await sellInventoryItem(item.inventory_id);
          setSelectedItem(null);
          notifyDustChanged();
          reload();
        } catch (err) {
          console.error('Failed to sell card:', err);
        }
        setConfirmAction(null);
      },
    });
  };

  const handleDestroy = (item) => {
    const infusion = item.infusion || 0;
    const dustReward = Math.max(2, infusion * 2);
    setConfirmAction({
      message: words.destroyConfirm,
      reward: `+${dustReward} ${words.dustSymbol}`,
      confirmLabel: words.destroy,
      destructive: true,
      onConfirm: async () => {
        try {
          await destroyInventoryItem(item.inventory_id);
          setSelectedItem(null);
          notifyDustChanged();
          reload();
        } catch (err) {
          console.error('Failed to destroy card:', err);
        }
        setConfirmAction(null);
      },
    });
  };

  const handleShuffle = () => {
    if (mediaItems.length === 0) return;
    pendingShuffle.current = true;
    slideshow.start(mediaItems, { order: 'random' });
  };

  useEffect(() => {
    if (pendingShuffle.current && slideshow.active && slideshow.current) {
      pendingShuffle.current = false;
      navigate(`/media/${slideshow.current.id}`);
    }
  }, [slideshow.active, slideshow.current, navigate]);

  /* Drag & drop: card onto card = new deck, card onto deck = add */
  const handleCardDrop = async (e, targetItem) => {
    const draggedId = Number(e.dataTransfer.getData('text/plain'));
    if (!draggedId || draggedId === targetItem.inventory_id) return;
    try {
      await createDeck('New Deck', [draggedId, targetItem.inventory_id]);
      reload();
    } catch (err) {
      console.error('Failed to create deck:', err);
    }
  };

  const handleDeckDrop = async (e, deckId) => {
    const raw = e.dataTransfer.getData('text/plain');
    const draggedId = Number(raw);
    if (!draggedId) {
      showToast(`Drop failed: no card data (raw: "${raw}")`, 'error');
      return;
    }
    try {
      await addToDeck(deckId, [draggedId]);
      showToast('Card added to deck', 'success');
      reload();
    } catch (err) {
      showToast(`Failed: ${err.message}`, 'error');
    }
  };

  const handleRenameDeck = async (deckId, name) => {
    try {
      await renameDeck(deckId, name);
      syncTable('decks');
    } catch (err) {
      console.error('Failed to rename deck:', err);
    }
  };

  const handleDeleteDeck = async (deckId) => {
    if (!confirm('Delete this deck? Cards will stay in your inventory.')) return;
    try {
      await deleteDeck(deckId);
      reload();
    } catch (err) {
      console.error('Failed to delete deck:', err);
    }
  };

  const { mediaItems, ticketItems, deckItems, ungrouped } = useMemo(() => {
    const media = items.filter(i => i.card_type === CARD_TYPE.MEDIA);
    return {
      mediaItems: media,
      ticketItems: items.filter(i => i.card_type === CARD_TYPE.MEMORY_TICKET),
      deckItems: items.filter(i => i.card_type === CARD_TYPE.QUEST_DECK),
      ungrouped: media.filter(i => !groupedIds.has(i.inventory_id)),
    };
  }, [items, groupedIds]);

  const bagIcon = <Icon name="backpack" className="w-16 h-16" />;

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white"><Icon name="inventory" className={ICON_CLASS.pageHeader} />Inventory</h1>
          <p className="text-gray-400 text-sm">{items.length} card{items.length !== 1 ? 's' : ''}</p>
        </div>
        {mediaItems.length > 0 && (
          <Button variant="secondary" onClick={handleShuffle}>
            Shuffle
          </Button>
        )}
      </div>

      {ungrouped.length > 0 || decks.length > 0 || ticketItems.length > 0 || deckItems.length > 0 ? (
        <>
          <div className={CARD_GRID}>
            {deckItems.length > 0 && (
              <Deck
                count={deckItems.length}
                card={
                  <ConsumableCard
                    cost={`${MARKET_PRICES.questDeck} ${words.dustSymbol}`}
                    title="Quest Decks"
                    subtitle={`${deckItems.length} deck${deckItems.length !== 1 ? 's' : ''}`}
                    icon={<Icon name="quest" className="w-28 h-28 opacity-70" />}
                    borderColor="border-amber-700/60"
                    bgGradient="bg-gradient-to-br from-indigo-700 to-purple-800"
                    onDoubleClick={() => handleDeckClick(deckItems[0])}
                  />
                }
              />
            )}
            {ticketItems.length > 0 && (
              <Deck
                count={ticketItems.length}
                card={
                  <TicketCard
                    cost={`${MARKET_PRICES.memoryTicket} ${words.dustSymbol}`}
                    subtitle={`${ticketItems.length} ticket${ticketItems.length !== 1 ? 's' : ''}`}
                    onDoubleClick={() => handleTicketClick(ticketItems[0])}
                  />
                }
              />
            )}
            {decks.map(d => (
              <UserDeck
                key={`deck-${d.id}`}
                deck={d}
                onOpen={openDeck}
                onRename={handleRenameDeck}
                onDelete={handleDeleteDeck}
                onDrop={handleDeckDrop}
              />
            ))}
            {ungrouped.map(item => (
              <InventoryMediaCard
                key={item.inventory_id}
                item={item}
                onClick={handleCardClick}
                onDrop={handleCardDrop}
              />
            ))}
          </div>
        </>
      ) : (
        <EmptyState
          icon={bagIcon}
          title="Inventory empty"
          description={words.inventoryEmpty}
        />
      )}

      {selectedItem && (
        <CardOverlay
          item={selectedItem}
          onClose={closeOverlay}
          actions={
            <>
              <DeckDropdown inventoryId={selectedItem.inventory_id} onAdd={closeOverlay} />
              <IconButton
                icon={<Icon name="coin" className="w-5 h-5" />}
                label={`${words.sell} (+${selectedItem.infusion || 0} ${words.dustSymbol})`}
                onClick={() => handleSell(selectedItem)}
                className="bg-blue-900/80 hover:bg-blue-700 text-blue-200 hover:text-white rounded-full p-2"
              />
              <IconButton
                icon={<Icon name="bomb" className="w-5 h-5" />}
                label={words.destroy}
                onClick={() => handleDestroy(selectedItem)}
                className="bg-red-900/80 hover:bg-red-700 text-red-200 hover:text-white rounded-full p-2"
              />
            </>
          }
        />
      )}

      <ConfirmModal action={confirmAction} onCancel={() => setConfirmAction(null)} />
    </div>
  );
}
