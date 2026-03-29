/**
 * @file Inventory page - shows media items the player has acquired as cards.
 */

import { useState, useEffect, useRef, memo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSlideshow } from '../../contexts/SlideshowContext.jsx';
import { MEDIA_TYPE, words } from '@photo-quest/shared';
import { fetchInventory, destroyInventoryItem, getMediaUrl, getImageUrl } from '../../utils/api.js';
import { EmptyState } from '../layout/index.js';
import { Button, IconButton, Icon, Modal, Spinner } from '../ui/index.js';

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
              <img src={thumbUrl} alt={item.title} className="w-full h-full object-contain" loading="lazy" />
            ) : (
              <video src={thumbUrl} preload="metadata" muted className="w-full h-full object-contain" />
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

function CardDetailModal({ item, open, onClose }) {
  if (!item) return null;
  const isImage = item.type === MEDIA_TYPE.IMAGE;
  const mediaUrl = getMediaUrl(item);
  const infusion = item.infusion || 0;

  return (
    <Modal open={open} onClose={onClose} title={item.title}>
      <div className="space-y-4">
        {/* Card frame */}
        <div className="rounded-2xl bg-gray-900 border border-gray-700 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2 bg-gray-800/80 border-b border-gray-700">
            <span className="text-gray-400 text-xs uppercase tracking-wide">{isImage ? 'Image' : 'Video'}</span>
            <span className="text-purple-300 text-xs font-medium">{words.dustSymbol} {infusion}</span>
          </div>
          <div className="p-3">
            <div className="relative rounded-lg overflow-hidden bg-black">
              {isImage ? (
                <img src={mediaUrl} alt={item.title} className="w-full max-h-[60vh] object-contain mx-auto" />
              ) : (
                <video src={mediaUrl} controls muted playsInline className="w-full max-h-[60vh] object-contain mx-auto" />
              )}
            </div>
          </div>
          <div className="px-4 py-3 border-t border-gray-700">
            <p className="text-white font-semibold">{item.title}</p>
          </div>
        </div>
      </div>
    </Modal>
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

      <CardDetailModal
        item={selectedItem}
        open={!!selectedItem}
        onClose={() => setSelectedItem(null)}
      />
    </div>
  );
}
