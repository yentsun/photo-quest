import { useState } from 'react';
import { MARKET_PRICES, words } from '@photo-quest/shared';
import Button from '../components/ui/Button.jsx';
import ConsumableCard from '../components/ui/ConsumableCard.jsx';
import EmptyState from '../components/EmptyState.jsx';
import { useLocalStore } from '../hooks/useLocalStore.js';
import { STORES } from '../db/localDb.js';
import { buyQuestDeck, buyTicket } from '../db/actions.js';
import './InventoryPage.css';

const ITEMS = [
  { kind: 'deck',   title: 'Quest Deck',    emoji: '🃏', gradient: 'quest',  borderColor: 'rgba(180, 83, 9, 0.6)', price: MARKET_PRICES.questDeck,    buy: buyQuestDeck },
  { kind: 'ticket', title: 'Memory Ticket', emoji: '🎟️', gradient: 'purple',                                       price: MARKET_PRICES.memoryTicket, buy: buyTicket    },
];

function MarketEntry({ item, busy, canAfford, onBuy }) {
  const label = `${item.price} ${words.dustSymbol}`;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', alignItems: 'center' }}>
      <ConsumableCard
        title={item.title}
        subtitle={label}
        emoji={item.emoji}
        gradient={item.gradient}
        borderColor={item.borderColor}
      />
      <Button onClick={onBuy} disabled={busy || !canAfford}>
        {busy ? 'Buying…' : `Buy (${label})`}
      </Button>
    </div>
  );
}

export default function MarketPage({ onLookForServer, server, sync }) {
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(null);
  const playerRows = useLocalStore(STORES.PLAYER_STATS, sync?.phase);
  const dust = playerRows?.[0]?.dust ?? 0;

  if (!server) {
    return (
      <EmptyState
        icon="🛒"
        title="Market"
        text="Connect to your server to buy quest decks and tickets."
        action={<Button variant="primary" size="lg" onClick={onLookForServer}>Look for server</Button>}
      />
    );
  }

  const handleBuy = async (item) => {
    if (busy) return;
    if (dust < item.price) { setError(`Need ${item.price} ${words.dustSymbol} — you have ${dust}`); return; }
    setBusy(item.kind); setError(null);
    try { await item.buy(); }
    catch (err) { setError(err.message); }
    finally { setBusy(null); }
  };

  return (
    <div className="inventory">
      {error && <div style={{ color: '#fca5a5', width: '100%' }}>{error}</div>}
      {ITEMS.map(item => (
        <MarketEntry
          key={item.kind}
          item={item}
          busy={busy === item.kind}
          canAfford={dust >= item.price}
          onBuy={() => handleBuy(item)}
        />
      ))}
    </div>
  );
}
