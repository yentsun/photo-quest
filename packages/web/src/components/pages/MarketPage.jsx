/**
 * @file Market page — buy quest decks and memory game tickets.
 */

import { useState, useEffect } from 'react';
import { MARKET_PRICES, words } from '@photo-quest/shared';
import { buyQuestDeck, buyMemoryTicket, getMemoryTickets } from '../../utils/api.js';
import { Button, Spinner } from '../ui/index.js';

function MarketItem({ title, description, price, count, buying, onBuy }) {
  return (
    <div className="rounded-2xl bg-gray-900 border border-gray-700 p-6 flex flex-col items-center gap-4 text-center">
      <h2 className="text-xl font-bold text-white">{title}</h2>
      <p className="text-gray-400 text-sm">{description}</p>
      {count != null && (
        <p className="text-purple-300 text-sm font-medium">
          Owned: {count}
        </p>
      )}
      <Button onClick={onBuy} disabled={buying}>
        {buying ? '...' : `${price} ${words.dustSymbol}`}
      </Button>
    </div>
  );
}

export default function MarketPage() {
  const [tickets, setTickets] = useState(null);
  const [buying, setBuying] = useState(null);
  const [message, setMessage] = useState(null);

  useEffect(() => {
    getMemoryTickets()
      .then(({ tickets }) => setTickets(tickets))
      .catch(() => {});
  }, []);

  const showMessage = (text) => {
    setMessage(text);
    setTimeout(() => setMessage(null), 3000);
  };

  const handleBuyDeck = async () => {
    setBuying('deck');
    try {
      await buyQuestDeck();
      showMessage('Quest deck added!');
      window.dispatchEvent(new Event('dust-changed'));
    } catch {
      showMessage('Not enough dust');
    } finally {
      setBuying(null);
    }
  };

  const handleBuyTicket = async () => {
    setBuying('ticket');
    try {
      const { tickets: t } = await buyMemoryTicket();
      setTickets(t);
      showMessage('Memory ticket purchased!');
      window.dispatchEvent(new Event('dust-changed'));
    } catch {
      showMessage('Not enough dust');
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

      {message && (
        <div className="mb-4 p-3 bg-blue-900/30 border border-blue-700/50 rounded-lg text-blue-300 text-sm text-center">
          {message}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <MarketItem
          title="Quest Deck"
          description="Add an extra deck of 10 cards to today's quest"
          price={MARKET_PRICES.questDeck}
          buying={buying === 'deck'}
          onBuy={handleBuyDeck}
        />
        <MarketItem
          title="Memory Ticket"
          description="Required to play the memory card game"
          price={MARKET_PRICES.memoryTicket}
          count={tickets}
          buying={buying === 'ticket'}
          onBuy={handleBuyTicket}
        />
      </div>
    </div>
  );
}
