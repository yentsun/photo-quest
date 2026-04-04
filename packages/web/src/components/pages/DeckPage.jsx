/**
 * @file Deck page — view cards inside a user-created deck.
 */

import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { words, clientRoutes } from '@photo-quest/shared';
import { fetchDeckCards, destroyInventoryItem, sellInventoryItem } from '../../utils/api.js';
import { Button, CARD_GRID, ConfirmModal, Spinner, MediaCard, CardOverlay, IconButton, Icon, DeckDropdown } from '../ui/index.js';
import { ICON_CLASS } from '../ui/Icon.jsx';
import { notifyDustChanged } from '../../utils/events.js';

export default function DeckPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [deckName, setDeckName] = useState('');
  const [cards, setCards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedItem, setSelectedItem] = useState(null);
  const [confirmAction, setConfirmAction] = useState(null);

  const reload = useCallback(() => {
    fetchDeckCards(id)
      .then(({ name, cards }) => { setDeckName(name); setCards(cards); })
      .catch(err => console.error('Failed to load deck:', err))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => { reload(); }, [reload]);

  const closeOverlay = useCallback(() => { setSelectedItem(null); reload(); }, [reload]);

  const handleSell = (item) => {
    const infusion = item.infusion || 0;
    const sellReward = infusion;
    setConfirmAction({
      message: sellReward > 0
        ? 'Sell this card back to library?'
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
          <h1 className="text-2xl font-bold text-white"><Icon name="deck" className={ICON_CLASS.pageHeader} />{deckName}</h1>
          <p className="text-gray-400 text-sm">{cards.length} card{cards.length !== 1 ? 's' : ''}</p>
        </div>
        <Button variant="ghost" onClick={() => navigate(clientRoutes.inventory)}>
          Back
        </Button>
      </div>
      <div className={CARD_GRID}>
        {cards.map(item => (
          <MediaCard
            key={item.inventory_id}
            item={item}
            onClick={() => setSelectedItem(item)}
          />
        ))}
      </div>
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
