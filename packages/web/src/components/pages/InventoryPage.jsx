/**
 * @file Inventory page - shows media items the player has acquired as cards.
 */

import { useState, useEffect, useRef, memo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSlideshow } from '../../contexts/SlideshowContext.jsx';
import { MEDIA_TYPE, words } from '@photo-quest/shared';
import { fetchInventory, destroyInventoryItem, freeInfuseMedia, getMediaUrl, getImageUrl } from '../../utils/api.js';
import { EmptyState } from '../layout/index.js';
import { Button, IconButton, Icon, Spinner } from '../ui/index.js';

const InventoryCard = memo(function InventoryCard({ item, onClick, onDestroy }) {
  const isImage = item.type === MEDIA_TYPE.IMAGE;
  const thumbUrl = isImage ? getImageUrl(item.id) : getMediaUrl(item);
  const infusion = item.infusion || 0;
  const dustReward = infusion > 0 ? infusion * 2 : 1;

  return (
    <div
      className="group cursor-pointer"
      onClick={() => onClick?.(item)}
    >
      <div className="relative rounded-2xl bg-gray-900 border border-gray-700 shadow-[0_4px_16px_rgba(0,0,0,0.4)] hover:shadow-[0_8px_32px_rgba(0,0,0,0.6)] hover:border-gray-500 transition-all overflow-hidden">
        {/* Top strip */}
        <div className="flex items-center justify-between px-3 py-1.5 bg-gray-800/80 border-b border-gray-700">
          <span className="text-gray-400 text-[10px] uppercase tracking-wide">{isImage ? 'Image' : 'Video'}</span>
          <span className="text-purple-300 text-[10px] font-medium">{words.dustSymbol} {infusion}</span>
        </div>

        {/* Art area */}
        <div className="p-2 pb-0">
          <div className="relative aspect-square rounded-lg overflow-hidden bg-black">
            {isImage ? (
              <img src={thumbUrl} alt={item.title} className="w-full h-full object-cover" loading="lazy" />
            ) : (
              <video src={thumbUrl} preload="metadata" muted className="w-full h-full object-cover" />
            )}
          </div>
        </div>

        {/* Bottom — title */}
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

function CardOverlay({ item, onClose }) {
  const [fullMedia, setFullMedia] = useState(false);
  const [infusion, setInfusion] = useState(item?.infusion || 0);
  const fullMediaRef = useRef(false);

  useEffect(() => { setInfusion(item?.infusion || 0); }, [item?.id]);
  useEffect(() => { fullMediaRef.current = fullMedia; }, [fullMedia]);

  /* Auto-infuse: 1 dust per 10s in card view, 2 per 10s in full view */
  useEffect(() => {
    if (!item) return;
    const interval = setInterval(() => {
      const amount = fullMediaRef.current ? 2 : 1;
      freeInfuseMedia(item.id, amount)
        .then(({ media }) => setInfusion(media.infusion))
        .catch(() => {});
    }, 10000);
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
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black cursor-pointer"
        onClick={() => setFullMedia(false)}
      >
        {isImage ? (
          <img src={mediaUrl} alt={item.title} className="max-w-full max-h-full object-contain" />
        ) : (
          <video src={mediaUrl} controls autoPlay muted playsInline className="max-w-full max-h-full object-contain" onClick={(e) => e.stopPropagation()} />
        )}
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 cursor-pointer"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl mx-4 rounded-2xl bg-gray-900 border border-gray-700 shadow-[0_8px_32px_rgba(0,0,0,0.5)] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
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
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setFullMedia(true)}
              className="absolute bottom-2 right-2 opacity-0 group-hover/art:opacity-100 transition-opacity bg-black/60 hover:bg-black/80 text-white"
            >
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

export default function InventoryPage() {
  const navigate = useNavigate();
  const slideshow = useSlideshow();
  const pendingShuffle = useRef(false);

  useEffect(() => { slideshow.stop(); }, []);  // eslint-disable-line react-hooks/exhaustive-deps

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedItem, setSelectedItem] = useState(null);
  const closeOverlay = useCallback(() => { setSelectedItem(null); loadInventory(); }, []);

  const loadInventory = () => {
    fetchInventory()
      .then(({ items }) => { setItems(items); setLoading(false); })
      .catch(err => { console.error('Failed to fetch inventory:', err); setLoading(false); });
  };

  useEffect(() => { loadInventory(); }, []);

  const handleCardClick = (item) => {
    setSelectedItem(item);
  };

  const handleDestroy = async (item) => {
    const infusion = item.infusion || 0;
    const dustReward = infusion > 0 ? infusion * 2 : 1;
    if (!confirm(`${words.destroyConfirm}\n\n+${dustReward} ${words.dustSymbol}`)) return;
    try {
      await destroyInventoryItem(item.inventory_id);
      setItems(prev => prev.filter(i => i.inventory_id !== item.inventory_id));
      setSelectedItem(null);
      window.dispatchEvent(new Event('dust-changed'));
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

      {items.length > 0 ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
          {items.map(item => (
            <InventoryCard
              key={item.inventory_id}
              item={item}
              onClick={handleCardClick}
              onDestroy={handleDestroy}
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
        <CardOverlay
          item={selectedItem}
          onClose={closeOverlay}
        />
      )}
    </div>
  );
}
