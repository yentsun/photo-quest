/**
 * @file Market page — buy cards with magic dust.
 */

import { useState } from 'react';
import { MARKET_PRICES, words } from '@photo-quest/shared';
import { buyQuestDeck, buyMemoryTicket } from '../../utils/api.js';
import { Button, ConsumableCard, TicketCard } from '../ui/index.js';
import { showToast } from '../ToasterMessage.jsx';

export default function MarketPage() {
  const [buying, setBuying] = useState(null);

  const handleBuyDeck = async () => {
    setBuying('deck');
    try {
      await buyQuestDeck();
      showToast('Quest deck added!', 'success');
      window.dispatchEvent(new Event('dust-changed'));
    } catch {
      showToast('Not enough dust', 'error');
    } finally {
      setBuying(null);
    }
  };

  const handleBuyTicket = async () => {
    setBuying('ticket');
    try {
      await buyMemoryTicket();
      showToast('Memory ticket added to inventory!', 'success');
      window.dispatchEvent(new Event('dust-changed'));
    } catch {
      showToast('Not enough dust', 'error');
    } finally {
      setBuying(null);
    }
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Market</h1>
        <p className="text-gray-400 text-sm">Spend your magic dust</p>
      </div>

      <div className="grid grid-cols-2 gap-8 justify-items-center">
        <ConsumableCard
          label="Quest"
          title="Quest Deck"
          subtitle="10 cards for today's quest"
          emoji="🗂️"
          borderColor="border-amber-700/60"
          bgGradient="bg-gradient-to-br from-amber-900 to-orange-900"
          className="w-full max-w-[200px]"
        >
          <div className="mt-3 text-center">
            <Button onClick={handleBuyDeck} disabled={buying === 'deck'}>
              {buying === 'deck' ? '...' : `${MARKET_PRICES.questDeck} ${words.dustSymbol}`}
            </Button>
          </div>
        </ConsumableCard>
        <TicketCard
          subtitle="Play one memory game"
          className="w-full max-w-[200px]"
        >
          <div className="mt-3 text-center">
            <Button onClick={handleBuyTicket} disabled={buying === 'ticket'}>
              {buying === 'ticket' ? '...' : `${MARKET_PRICES.memoryTicket} ${words.dustSymbol}`}
            </Button>
          </div>
        </TicketCard>
      </div>
    </div>
  );
}
