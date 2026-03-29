/**
 * @file Inventory page - shows media items the player has acquired.
 */

import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSlideshow } from '../../contexts/SlideshowContext.jsx';
import { fetchInventory } from '../../utils/api.js';
import { MediaGrid } from '../media/index.js';
import { EmptyState } from '../layout/index.js';
import { Button, Icon, Spinner } from '../ui/index.js';

/**
 * Page showing all items in the player's inventory.
 */
export default function InventoryPage() {
  const navigate = useNavigate();
  const slideshow = useSlideshow();
  const pendingShuffle = useRef(false);

  /* Clear slideshow when entering inventory. */
  useEffect(() => { slideshow.stop(); }, []);  // eslint-disable-line react-hooks/exhaustive-deps

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetchInventory()
      .then(({ items }) => { if (!cancelled) { setItems(items); setLoading(false); } })
      .catch(err => { console.error('Failed to fetch inventory:', err); if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const handleMediaClick = (clickedMedia) => {
    navigate(`/media/${clickedMedia.id}`);
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
      {/* Header */}
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

      {/* Media Grid or Empty State */}
      <MediaGrid
        items={items}
        onItemClick={handleMediaClick}
        emptyState={
          <EmptyState
            icon={bagIcon}
            title="Inventory empty"
            description="Play games to earn magic dust and collect media for your inventory."
          />
        }
      />
    </div>
  );
}
