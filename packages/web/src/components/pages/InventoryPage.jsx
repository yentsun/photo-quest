/**
 * @file Inventory page - shows media items the player has acquired.
 */

import { useState, useEffect, useRef, memo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSlideshow } from '../../contexts/SlideshowContext.jsx';
import { MEDIA_TYPE, words } from '@photo-quest/shared';
import { fetchInventory, destroyInventoryItem, getMediaUrl } from '../../utils/api.js';
import { EmptyState } from '../layout/index.js';
import { Button, Icon, Spinner } from '../ui/index.js';

const InventoryCard = memo(function InventoryCard({ item, onClick, onDestroy }) {
  const isImage = item.type === MEDIA_TYPE.IMAGE;
  const mediaUrl = getMediaUrl(item);
  const infusion = item.infusion || 0;
  const dustReward = infusion > 0 ? infusion * 2 : 1;

  return (
    <div className="relative aspect-square rounded-lg overflow-hidden bg-gray-800 cursor-pointer group">
      <div onClick={() => onClick?.(item)} className="w-full h-full">
        {isImage ? (
          <img src={mediaUrl} alt={item.title} className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105" loading="lazy" />
        ) : (
          <video src={mediaUrl} preload="metadata" muted className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105" />
        )}
      </div>

      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />

      <div className="absolute bottom-0 left-0 right-0 p-3">
        <p className="text-white text-sm font-medium truncate opacity-0 group-hover:opacity-100 transition-opacity">{item.title}</p>
      </div>

      {/* Infusion badge */}
      <div className="absolute top-2 left-2">
        <span className="px-2 py-1 text-xs font-medium rounded bg-black/50 text-white">
          {infusion > 0 ? `${words.dustSymbol} ${infusion}` : isImage ? 'IMG' : 'VID'}
        </span>
      </div>

      {/* Destroy button */}
      <button
        className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded-full bg-red-900/70 hover:bg-red-700 text-red-200 hover:text-white"
        title={`${words.destroy} (+${dustReward} ${words.dustSymbol})`}
        onClick={(e) => { e.stopPropagation(); onDestroy?.(item); }}
      >
        <Icon name="trash" className="w-4 h-4" />
      </button>
    </div>
  );
});

export default function InventoryPage() {
  const navigate = useNavigate();
  const slideshow = useSlideshow();
  const pendingShuffle = useRef(false);

  useEffect(() => { slideshow.stop(); }, []);  // eslint-disable-line react-hooks/exhaustive-deps

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadInventory = () => {
    fetchInventory()
      .then(({ items }) => { setItems(items); setLoading(false); })
      .catch(err => { console.error('Failed to fetch inventory:', err); setLoading(false); });
  };

  useEffect(() => { loadInventory(); }, []);

  const handleMediaClick = (clickedMedia) => {
    navigate(`/media/${clickedMedia.id}`);
  };

  const handleDestroy = async (item) => {
    const infusion = item.infusion || 0;
    const dustReward = infusion > 0 ? infusion * 2 : 1;
    if (!confirm(`${words.destroyConfirm}\n\n+${dustReward} ${words.dustSymbol}`)) return;
    try {
      await destroyInventoryItem(item.inventory_id);
      setItems(prev => prev.filter(i => i.inventory_id !== item.inventory_id));
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
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
          {items.map(item => (
            <InventoryCard
              key={item.inventory_id}
              item={item}
              onClick={handleMediaClick}
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
    </div>
  );
}
