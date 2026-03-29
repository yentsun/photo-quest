/**
 * @file Inventory page - cards with drag & drop piles.
 */

import { useState, useEffect, useRef, memo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSlideshow } from '../../contexts/SlideshowContext.jsx';
import { MEDIA_TYPE, words } from '@photo-quest/shared';
import {
  fetchInventory, destroyInventoryItem, freeInfuseMedia, getMediaUrl, getImageUrl,
  fetchPiles, createPile, renamePile as renamePileApi, deletePile as deletePileApi, addToPile,
} from '../../utils/api.js';
import { EmptyState } from '../layout/index.js';
import { Button, IconButton, Icon, Input, Spinner } from '../ui/index.js';

/* ── Card component ── */

const InventoryCard = memo(function InventoryCard({ item, onClick, onDestroy, onDragStart, onDragOver, onDrop }) {
  const isImage = item.type === MEDIA_TYPE.IMAGE;
  const thumbUrl = isImage ? getImageUrl(item.id) : getMediaUrl(item);
  const infusion = item.infusion || 0;
  const dustReward = infusion > 0 ? infusion * 2 : 1;
  const [dragOver, setDragOver] = useState(false);

  return (
    <div
      className={`group cursor-pointer ${dragOver ? 'ring-2 ring-blue-400 rounded-2xl' : ''}`}
      draggable
      onDragStart={(e) => { e.dataTransfer.setData('text/plain', String(item.inventory_id)); onDragStart?.(item); }}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); onDragOver?.(e); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => { e.preventDefault(); setDragOver(false); onDrop?.(e, item); }}
      onClick={() => onClick?.(item)}
    >
      <div className="relative rounded-2xl bg-gray-900 border border-gray-700 shadow-[0_4px_16px_rgba(0,0,0,0.4)] hover:shadow-[0_8px_32px_rgba(0,0,0,0.6)] hover:border-gray-500 transition-all overflow-hidden">
        <div className="flex items-center justify-between px-3 py-1.5 bg-gray-800/80 border-b border-gray-700">
          <span className="text-gray-400 text-[10px] uppercase tracking-wide">{isImage ? 'Image' : 'Video'}</span>
          <span className="text-purple-300 text-[10px] font-medium">{words.dustSymbol} {infusion}</span>
        </div>
        <div className="p-2 pb-0">
          <div className="relative aspect-square rounded-lg overflow-hidden bg-black">
            {isImage ? (
              <img src={thumbUrl} alt={item.title} className="w-full h-full object-cover" loading="lazy" draggable={false} />
            ) : (
              <video src={thumbUrl} preload="metadata" muted className="w-full h-full object-cover" />
            )}
          </div>
        </div>
        <div className="px-3 py-2 flex items-center justify-between gap-1">
          <p className="text-white text-xs font-medium truncate flex-1">{item.title}</p>
          <div className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
            <IconButton
              icon={<Icon name="trash" className="w-3.5 h-3.5" />}
              label={`${words.destroy} (+${dustReward} ${words.dustSymbol})`}
              onClick={(e) => { e.stopPropagation(); onDestroy?.(item); }}
              className="bg-red-900/70 hover:bg-red-700 text-red-200 hover:text-white"
            />
          </div>
        </div>
      </div>
    </div>
  );
});

/* ── Pile card (stacked card look) ── */

function PileCard({ pile, expanded, onToggle, onRename, onDelete, onDrop }) {
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
      className={`group cursor-pointer ${dragOver ? 'ring-2 ring-blue-400 rounded-2xl' : ''}`}
      onClick={() => !editing && onToggle(pile.id)}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => { e.preventDefault(); setDragOver(false); onDrop(e, pile.id); }}
    >
      {/* Stacked shadow layers */}
      <div className="relative">
        {pile.cardCount >= 3 && (
          <div className="absolute inset-0 rounded-2xl bg-gray-700 border border-gray-600 translate-x-2 translate-y-2" />
        )}
        {pile.cardCount >= 2 && (
          <div className="absolute inset-0 rounded-2xl bg-gray-800 border border-gray-600 translate-x-1 translate-y-1" />
        )}
        <div className={`relative rounded-2xl bg-gray-900 border shadow-[0_4px_16px_rgba(0,0,0,0.4)] overflow-hidden transition-all
          ${expanded ? 'border-blue-500' : 'border-gray-700 hover:border-gray-500'}`}>
          {/* Art area with preview */}
          <div className="p-2 pb-0">
            <div className="relative aspect-square rounded-lg overflow-hidden bg-black">
              {previewUrl ? (
                <img src={previewUrl} alt={pile.name} className="w-full h-full object-cover" loading="lazy" draggable={false} />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-gray-600 text-3xl">?</div>
              )}
            </div>
          </div>
          {/* Bottom — name + count + actions */}
          <div className="px-3 py-2">
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
                  label="Delete pile"
                  onClick={(e) => { e.stopPropagation(); onDelete(pile.id); }}
                  className="text-red-400 hover:text-red-300"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
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
  const [expandedPiles, setExpandedPiles] = useState(new Set());
  const [pileCards, setPileCards] = useState({});
  const [loading, setLoading] = useState(true);
  const [selectedItem, setSelectedItem] = useState(null);
  const closeOverlay = useCallback(() => { setSelectedItem(null); reload(); }, []);

  const reload = () => {
    Promise.all([fetchInventory(), fetchPiles()])
      .then(([{ items }, pilesData]) => { setItems(items); setPiles(pilesData); setLoading(false); })
      .catch(err => { console.error('Failed to load inventory:', err); setLoading(false); });
  };

  useEffect(() => { reload(); }, []);

  const togglePile = async (pileId) => {
    const next = new Set(expandedPiles);
    if (next.has(pileId)) {
      next.delete(pileId);
    } else {
      next.add(pileId);
      if (!pileCards[pileId]) {
        const res = await fetch(`/piles/${pileId}/cards`);
        const cards = await res.json();
        setPileCards(prev => ({ ...prev, [pileId]: cards }));
      }
    }
    setExpandedPiles(next);
  };

  const handleCardClick = (item) => setSelectedItem(item);

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
    if (items.length === 0) return;
    pendingShuffle.current = true;
    slideshow.start(items, { order: 'random' });
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
    if (draggedId === targetItem.inventory_id) return;
    try {
      await createPile('New Pile', [draggedId, targetItem.inventory_id]);
      reload();
    } catch (err) {
      console.error('Failed to create pile:', err);
    }
  };

  const handlePileDrop = async (e, pileId) => {
    const draggedId = Number(e.dataTransfer.getData('text/plain'));
    try {
      await addToPile(pileId, [draggedId]);
      setPileCards(prev => ({ ...prev, [pileId]: null }));
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

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] gap-3">
        <Spinner size="lg" />
        <p className="text-gray-400 text-sm">Loading inventory...</p>
      </div>
    );
  }

  const bagIcon = <Icon name="backpack" className="w-16 h-16" />;

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Inventory</h1>
          <p className="text-gray-400 text-sm">{items.length} items</p>
        </div>
        {items.length > 0 && (
          <Button variant="secondary" onClick={handleShuffle}>
            Shuffle
          </Button>
        )}
      </div>

      {items.length > 0 || piles.length > 0 ? (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            {/* Piles as stacked cards */}
            {piles.map(pile => (
              <PileCard
                key={`pile-${pile.id}`}
                pile={pile}
                expanded={expandedPiles.has(pile.id)}
                onToggle={togglePile}
                onRename={handleRenamePile}
                onDelete={handleDeletePile}
                onDrop={handlePileDrop}
              />
            ))}
            {/* Ungrouped cards */}
            {items.map(item => (
              <InventoryCard
                key={item.inventory_id}
                item={item}
                onClick={handleCardClick}
                onDestroy={handleDestroy}
                onDrop={handleCardDrop}
              />
            ))}
          </div>

          {/* Expanded pile cards */}
          {piles.filter(p => expandedPiles.has(p.id) && pileCards[p.id]).map(pile => (
            <div key={`expanded-${pile.id}`} className="mt-6">
              <h3 className="text-white font-semibold text-sm mb-3">{pile.name}</h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                {pileCards[pile.id].map(item => (
                  <InventoryCard
                    key={item.inventory_id}
                    item={item}
                    onClick={handleCardClick}
                    onDestroy={handleDestroy}
                  />
                ))}
              </div>
            </div>
          ))}
        </>
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
