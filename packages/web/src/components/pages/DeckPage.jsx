/**
 * @file Deck page — view cards inside a user-created deck.
 */

import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { words, clientRoutes } from '@photo-quest/shared';
import { fetchDeckCards, destroyInventoryItem, sellInventoryItem } from '../../utils/api.js';
import { Button, Spinner, MediaCard, CardOverlay, IconButton, Icon } from '../ui/index.js';

function DeckMediaCard({ item, onClick, onDestroy, onSell }) {
  const infusion = item.infusion || 0;
  const destroyReward = infusion > 0 ? infusion * 2 : 1;
  const sellReward = infusion;

  return (
    <div className="group">
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

export default function DeckPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [cards, setCards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedItem, setSelectedItem] = useState(null);

  const reload = useCallback(() => {
    fetchDeckCards(id)
      .then(setCards)
      .catch(err => console.error('Failed to load deck:', err))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => { reload(); }, [reload]);

  const closeOverlay = useCallback(() => { setSelectedItem(null); reload(); }, [reload]);

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

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] gap-3">
        <Spinner size="lg" />
        <p className="text-gray-400 text-sm">Loading deck...</p>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <p className="text-gray-400 text-sm">{cards.length} card{cards.length !== 1 ? 's' : ''}</p>
        </div>
        <Button variant="ghost" onClick={() => navigate(clientRoutes.inventory)}>
          Back
        </Button>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
        {cards.map(item => (
          <DeckMediaCard
            key={item.inventory_id}
            item={item}
            onClick={setSelectedItem}
            onDestroy={handleDestroy}
            onSell={handleSell}
          />
        ))}
      </div>
      {selectedItem && (
        <CardOverlay
          item={selectedItem}
          onClose={closeOverlay}
          actions={
            <>
              <IconButton
                icon={<Icon name="prev" className="w-5 h-5" />}
                label={`${words.sell} (+${selectedItem.infusion || 0} ${words.dustSymbol})`}
                onClick={() => handleSell(selectedItem)}
                className="bg-blue-900/80 hover:bg-blue-700 text-blue-200 hover:text-white rounded-full p-2"
              />
              <IconButton
                icon={<Icon name="trash" className="w-5 h-5" />}
                label={words.destroy}
                onClick={() => handleDestroy(selectedItem)}
                className="bg-red-900/80 hover:bg-red-700 text-red-200 hover:text-white rounded-full p-2"
              />
            </>
          }
        />
      )}
    </div>
  );
}
