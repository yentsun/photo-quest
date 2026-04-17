/**
 * @file Market page — buy cards with magic dust.
 */

import { useState } from 'react';
import { MARKET_PRICES, words } from '@photo-quest/shared';
import { buyQuestDeck, buyMemoryTicket } from '../../db/actions.js';
import { CARD_GRID, Deck, Icon, ConsumableCard, TicketCard } from '../ui/index.js';
import { ICON_CLASS } from '../ui/Icon.jsx';
import { showToast } from '../ToasterMessage.jsx';

export default function MarketPage() {
  const [buying, setBuying] = useState(null);

  const handleBuyDeck = async () => {
    if (buying) return;
    setBuying('deck');
    try {
      await buyQuestDeck();
      showToast('Quest deck added!', 'success');
    } catch (err) {
      showToast(err.message || 'Not enough dust', 'error');
    } finally {
      setBuying(null);
    }
  };

  const handleBuyTicket = async () => {
    if (buying) return;
    setBuying('ticket');
    try {
      await buyMemoryTicket();
      showToast('Memory ticket added to inventory!', 'success');
    } catch (err) {
      showToast(err.message || 'Not enough dust', 'error');
    } finally {
      setBuying(null);
    }
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white"><Icon name="market" className={ICON_CLASS.pageHeader} />Market</h1>
        <p className="text-gray-400 text-sm">Spend your magic dust</p>
      </div>

      <div className={CARD_GRID}>
        <Deck
          count={3}
          card={
            <ConsumableCard
              cost={`${MARKET_PRICES.questDeck} ${words.dustSymbol}`}
              title="Quest Deck"
              subtitle="10 cards for today's quest"
              icon={<Icon name="quest" className="w-28 h-28 opacity-70" />}
              borderColor="border-amber-700/60"
              bgGradient="bg-gradient-to-br from-amber-900 to-orange-900"
              onDoubleClick={handleBuyDeck}
            />
          }
        />
        <TicketCard
          cost={`${MARKET_PRICES.memoryTicket} ${words.dustSymbol}`}
          subtitle="Play one memory game"
          onDoubleClick={handleBuyTicket}
        />
      </div>
    </div>
  );
}
