/**
 * @file Inventory page - cards with drag & drop piles.
 */

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSlideshow } from '../../contexts/SlideshowContext.jsx';
import { MEDIA_TYPE, CARD_TYPE, words, clientRoutes } from '@photo-quest/shared';
import {
  fetchInventory, destroyInventoryItem, sellInventoryItem, freeInfuseMedia, getMediaUrl, getImageUrl,
  fetchPiles, fetchPileCards, createPile, renamePile as renamePileApi, deletePile as deletePileApi, addToPile,
  fetchQuestDecks,
} from '../../utils/api.js';
import { EmptyState } from '../layout/index.js';
import { Button, IconButton, Icon, Input, Spinner, MediaCard, ConsumableCard, Deck } from '../ui/index.js';

/* ── Inventory media card (wraps MediaCard with drag & drop + actions) ── */

function InventoryMediaCard({ item, onClick, onDestroy, onSell, onDrop }) {
  const infusion = item.infusion || 0;
  const destroyReward = infusion > 0 ? infusion * 2 : 1;
  const sellReward = infusion;
  const [dragOver, setDragOver] = useState(false);

  return (
    <div
      className={`group ${dragOver ? 'ring-2 ring-blue-400 rounded-2xl' : ''}`}
      draggable
      onDragStart={(e) => { e.dataTransfer.setData('text/plain', String(item.inventory_id)); }}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => { e.preventDefault(); setDragOver(false); onDrop?.(e, item); }}
    >
      <MediaCard
        item={item}
        onClick={() => onClick?.(item)}
        actions={
          <div className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0 flex gap-0.5">
            {onSell && (
              <IconButton
                icon={<Icon name="prev" className="w-3.5 h-3.5" />}
                label={`${words.sell} (+${sellReward} ${words.dustSymbol})`}
                onClick={(e) => { e.stopPropagation(); onSell(item); }}
                className="bg-blue-900/70 hover:bg-blue-700 text-blue-200 hover:text-white"
              />
            )}
            <IconButton
              icon={<Icon name="trash" className="w-3.5 h-3.5" />}
              label={`${words.destroy} (+${destroyReward} ${words.dustSymbol})`}
              onClick={(e) => { e.stopPropagation(); onDestroy?.(item); }}
              className="bg-red-900/70 hover:bg-red-700 text-red-200 hover:text-white"
            />
          </div>
        }
      />
    </div>
  );
}

/* ── Pile deck ── */

function PileDeck({ pile, onOpen, onRename, onDelete, onDrop }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(pile.name);
  const [dragOver, setDragOver] = useState(false);

  const handleSave = () => {
    setEditing(false);
    if (name.trim() && name !== pile.name) onRename(pile.id, name.trim());
  };

  const previewUrl = pile.preview
    ? (pile.preview.type === MEDIA_TYPE.IMAGE ? getImageUrl(pile.preview.id) : getMediaUrl(pile.preview))
    : null;

  return (
    <div
      className={`group ${dragOver ? 'ring-2 ring-blue-400 rounded-2xl' : ''}`}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => { e.preventDefault(); setDragOver(false); onDrop(e, pile.id); }}
    >
      <Deck
        count={pile.cardCount}
        onClick={() => !editing && onOpen(pile.id)}
        art={
          previewUrl ? (
            <img src={previewUrl} alt={pile.name} className="w-full h-full object-cover" loading="lazy" draggable={false} />
          ) : (
            <div className="w-full h-full bg-black flex items-center justify-center text-gray-600 text-3xl">?</div>
          )
        }
        footer={
          <>
            {editing ? (
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                onBlur={handleSave}
                onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); }}
                autoFocus
                onClick={(e) => e.stopPropagation()}
                className="text-xs"
              />
            ) : (
              <p className="text-white text-xs font-medium truncate">{pile.name}</p>
            )}
            <div className="flex items-center justify-between mt-0.5">
              <span className="text-gray-500 text-[10px]">{pile.cardCount} card{pile.cardCount !== 1 ? 's' : ''}</span>
              <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                <IconButton
                  icon={<Icon name="info" className="w-3 h-3" />}
                  label="Rename"
                  onClick={(e) => { e.stopPropagation(); setEditing(true); }}
                />
                <IconButton
                  icon={<Icon name="trash" className="w-3 h-3" />}
                  label="Delete deck"
                  onClick={(e) => { e.stopPropagation(); onDelete(pile.id); }}
                  className="text-red-400 hover:text-red-300"
                />
              </div>
            </div>
          </>
        }
      />
    </div>
  );
}

/* ── Card detail overlay ── */

function CardOverlay({ item, onClose }) {
  const [fullMedia, setFullMedia] = useState(false);
  const [infusion, setInfusion] = useState(item?.infusion || 0);
  const fullMediaRef = useRef(false);

  useEffect(() => { setInfusion(item?.infusion || 0); }, [item?.id]);
  useEffect(() => { fullMediaRef.current = fullMedia; }, [fullMedia]);

  useEffect(() => {
    if (!item) return;
    const startTime = Date.now();
    const interval = setInterval(() => {
      if (Date.now() - startTime >= 120000) { clearInterval(interval); return; }
      const amount = fullMediaRef.current ? 2 : 1;
      freeInfuseMedia(item.id, amount)
        .then(({ media }) => setInfusion(media.infusion))
        .catch(() => {});
    }, 5000);
    return () => clearInterval(interval);
  }, [item?.id]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') { fullMediaRef.current ? setFullMedia(false) : onClose(); }
      if (e.key === 'f' || e.key === 'F') setFullMedia(prev => !prev);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (!item) return null;
  const isImage = item.type === MEDIA_TYPE.IMAGE;
  const mediaUrl = getMediaUrl(item);

  if (fullMedia) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black cursor-pointer" onClick={() => setFullMedia(false)}>
        {isImage ? (
          <img src={mediaUrl} alt={item.title} className="max-w-full max-h-full object-contain" />
        ) : (
          <video src={mediaUrl} controls autoPlay muted playsInline className="max-w-full max-h-full object-contain" onClick={(e) => e.stopPropagation()} />
        )}
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 cursor-pointer" onClick={onClose}>
      <div className="w-full max-w-2xl mx-4 rounded-2xl bg-gray-900 border border-gray-700 shadow-[0_8px_32px_rgba(0,0,0,0.5)] overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-2 bg-gray-800/80 border-b border-gray-700">
          <span className="text-gray-400 text-xs uppercase tracking-wide">{isImage ? 'Image' : 'Video'}</span>
          <span className="text-purple-300 text-xs font-medium">{words.dustSymbol} {infusion}</span>
        </div>
        <div className="p-3 pb-0">
          <div className="relative aspect-square rounded-lg overflow-hidden bg-black group/art">
            {isImage ? (
              <img src={mediaUrl} alt={item.title} className="w-full h-full object-cover" />
            ) : (
              <video src={mediaUrl} controls muted playsInline className="w-full h-full object-cover" onClick={(e) => e.stopPropagation()} />
            )}
            <Button variant="ghost" size="sm" onClick={() => setFullMedia(true)} className="absolute bottom-2 right-2 opacity-0 group-hover/art:opacity-100 transition-opacity bg-black/60 hover:bg-black/80 text-white">
              F
            </Button>
          </div>
        </div>
        <div className="px-4 py-3">
          <p className="text-white font-semibold">{item.title}</p>
        </div>
      </div>
    </div>
  );
}

/* ── Main page ── */

export default function InventoryPage() {
  const navigate = useNavigate();
  const slideshow = useSlideshow();
  const pendingShuffle = useRef(false);

  useEffect(() => { slideshow.stop(); }, []);  // eslint-disable-line react-hooks/exhaustive-deps

  const [items, setItems] = useState([]);
  const [piles, setPiles] = useState([]);
  const [groupedIds, setGroupedIds] = useState(new Set());
  const [viewingPile, setViewingPile] = useState(null);
  const [viewingPileCards, setViewingPileCards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedItem, setSelectedItem] = useState(null);
  const closeOverlay = useCallback(() => { setSelectedItem(null); reload(); }, []);

  const reload = () => {
    Promise.all([fetchQuestDecks(), fetchInventory(), fetchPiles()])
      .then(([, { items }, { piles: pilesData, groupedIds: gIds }]) => {
        setItems(items);
        setPiles(pilesData);
        setGroupedIds(new Set(gIds));
        setLoading(false);
      })
      .catch(err => { console.error('Failed to load inventory:', err); setLoading(false); });
  };

  useEffect(() => { reload(); }, []);

  const openPile = async (pileId) => {
    try {
      const pile = piles.find(p => p.id === pileId);
      const cards = await fetchPileCards(pileId);
      setViewingPile(pile);
      setViewingPileCards(cards);
    } catch (err) {
      console.error('Failed to open pile:', err);
    }
  };

  const closePile = () => {
    setViewingPile(null);
    setViewingPileCards([]);
  };

  const handleCardClick = (item) => setSelectedItem(item);

  const handleTicketClick = (item) => {
    navigate(clientRoutes.memoryGame, { state: { ticketId: item.inventory_id } });
  };

  const handleDeckClick = (item) => {
    navigate(clientRoutes.quest, { state: { deckId: item.ref_id } });
  };

  const handleSell = async (item) => {
    const infusion = item.infusion || 0;
    const sellReward = infusion;
    const msg = sellReward > 0
      ? `Sell this card back to library?\n\n+${sellReward} ${words.dustSymbol}`
      : 'Return this card to library for free?';
    if (!confirm(msg)) return;
    try {
      await sellInventoryItem(item.inventory_id);
      setSelectedItem(null);
      window.dispatchEvent(new Event('dust-changed'));
      reload();
    } catch (err) {
      console.error('Failed to sell card:', err);
    }
  };

  const handleDestroy = async (item) => {
    const infusion = item.infusion || 0;
    const dustReward = infusion > 0 ? infusion * 2 : 1;
    if (!confirm(`${words.destroyConfirm}\n\n+${dustReward} ${words.dustSymbol}`)) return;
    try {
      await destroyInventoryItem(item.inventory_id);
      setSelectedItem(null);
      window.dispatchEvent(new Event('dust-changed'));
      reload();
    } catch (err) {
      console.error('Failed to destroy card:', err);
    }
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

  /* Drag & drop: card onto card = new pile, card onto pile = add */
  const handleCardDrop = async (e, targetItem) => {
    const draggedId = Number(e.dataTransfer.getData('text/plain'));
    if (!draggedId || draggedId === targetItem.inventory_id) return;
    try {
      await createPile('New Pile', [draggedId, targetItem.inventory_id]);
      reload();
    } catch (err) {
      console.error('Failed to create pile:', err);
    }
  };

  const handlePileDrop = async (e, pileId) => {
    const draggedId = Number(e.dataTransfer.getData('text/plain'));
    if (!draggedId) return;
    try {
      await addToPile(pileId, [draggedId]);
      reload();
    } catch (err) {
      console.error('Failed to add to pile:', err);
    }
  };

  const handleRenamePile = async (pileId, name) => {
    try {
      await renamePileApi(pileId, name);
      setPiles(prev => prev.map(p => p.id === pileId ? { ...p, name } : p));
    } catch (err) {
      console.error('Failed to rename pile:', err);
    }
  };

  const handleDeletePile = async (pileId) => {
    if (!confirm('Delete this pile? Cards will stay in your inventory.')) return;
    try {
      await deletePileApi(pileId);
      reload();
    } catch (err) {
      console.error('Failed to delete pile:', err);
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

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] gap-3">
        <Spinner size="lg" />
        <p className="text-gray-400 text-sm">Loading inventory...</p>
      </div>
    );
  }

  const bagIcon = <Icon name="backpack" className="w-16 h-16" />;

  /* Pile view */
  if (viewingPile) {
    return (
      <div className="p-4 sm:p-6 lg:p-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-white">{viewingPile.name}</h1>
            <p className="text-gray-400 text-sm">{viewingPileCards.length} cards</p>
          </div>
          <Button variant="ghost" onClick={closePile}>
            Back
          </Button>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
          {viewingPileCards.map(item => (
            <InventoryMediaCard
              key={item.inventory_id}
              item={item}
              onClick={handleCardClick}
              onDestroy={handleDestroy}
              onSell={handleSell}
            />
          ))}
        </div>
        {selectedItem && (
          <CardOverlay item={selectedItem} onClose={closeOverlay} />
        )}
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Inventory</h1>
          <p className="text-gray-400 text-sm">{items.length} card{items.length !== 1 ? 's' : ''}</p>
        </div>
        {mediaItems.length > 0 && (
          <Button variant="secondary" onClick={handleShuffle}>
            Shuffle
          </Button>
        )}
      </div>

      {ungrouped.length > 0 || piles.length > 0 || ticketItems.length > 0 || deckItems.length > 0 ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
          {deckItems.map(item => (
            <ConsumableCard
              key={`deck-${item.inventory_id}`}
              label="Quest"
              title={`Deck ${(item.deck_index ?? 0) + 1}`}
              subtitle={`${item.current_position ?? 0}/${item.total_cards ?? 0} viewed`}
              emoji="🗂️"
              borderColor="border-amber-700/60"
              bgGradient="bg-gradient-to-br from-indigo-700 to-purple-800"
              onClick={() => handleDeckClick(item)}
            />
          ))}
          {ticketItems.map(item => (
            <ConsumableCard
              key={`ticket-${item.inventory_id}`}
              label="Ticket"
              title="Memory Game"
              subtitle="Click to play"
              emoji="🃏"
              borderColor="border-purple-700/60"
              bgGradient="bg-gradient-to-br from-purple-900 to-blue-900"
              onClick={() => handleTicketClick(item)}
            />
          ))}
          {piles.map(pile => (
            <PileDeck
              key={`pile-${pile.id}`}
              pile={pile}
              onOpen={openPile}
              onRename={handleRenamePile}
              onDelete={handleDeletePile}
              onDrop={handlePileDrop}
            />
          ))}
          {ungrouped.map(item => (
            <InventoryMediaCard
              key={item.inventory_id}
              item={item}
              onClick={handleCardClick}
              onDestroy={handleDestroy}
              onSell={handleSell}
              onDrop={handleCardDrop}
            />
          ))}
        </div>
      ) : (
        <EmptyState
          icon={bagIcon}
          title="Inventory empty"
          description={words.inventoryEmpty}
        />
      )}

      {selectedItem && (
        <CardOverlay item={selectedItem} onClose={closeOverlay} />
      )}
    </div>
  );
}
