import { useState } from 'react';
import { CARD_TYPE, MARKET_PRICES, words } from '@photo-quest/shared';
import Button from '../components/ui/Button.jsx';
import ConsumableCard from '../components/ui/ConsumableCard.jsx';
import MediaCard from '../components/ui/MediaCard.jsx';
import EmptyState from '../components/EmptyState.jsx';
import { useLocalStore } from '../hooks/useLocalStore.js';
import { STORES } from '../db/localDb.js';
import { buyQuestDeck, buyTicket, buyMarketCard } from '../db/actions.js';
import './InventoryPage.css';

/* SEEN_MEDIA is written every time the player is actually shown a media
 * item (each quest card on display, all 8 memory cards on game start).
 * Subtracting owned ids gives the cards eligible to buy in the market —
 * unopened decks and unused tickets don't leak in. */
function collectMarketCards(seen, items) {
  if (!seen?.length) return [];
  const ownedIds = new Set();
  for (const it of items || []) {
    if (it.card_type === CARD_TYPE.MEDIA && it.id) ownedIds.add(it.id);
  }
  return seen.filter(c => c?.id && !ownedIds.has(c.id));
}

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

function cardPrice(card) {
  return Math.max(2, (card.infusion || 0) * 2);
}

function MarketCard({ card, serverUrl, busy, canAfford, onBuy }) {
  const price = cardPrice(card);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', alignItems: 'center' }}>
      <MediaCard item={card} serverUrl={serverUrl} />
      <Button onClick={onBuy} disabled={busy || !canAfford}>
        {busy ? 'Buying…' : `Buy (${price} ${words.dustSymbol})`}
      </Button>
    </div>
  );
}

export default function MarketPage({ onLookForServer, server, sync }) {
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(null);
  const playerRows = useLocalStore(STORES.PLAYER_STATS, sync?.phase);
  const items      = useLocalStore(STORES.CARDS);
  const seen       = useLocalStore(STORES.SEEN_MEDIA);
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

  const handleBuyCard = async (card) => {
    const price = cardPrice(card);
    if (busy) return;
    if (dust < price) { setError(`Need ${price} ${words.dustSymbol} — you have ${dust}`); return; }
    setBusy(`card-${card.id}`); setError(null);
    try { await buyMarketCard(card); }
    catch (err) { setError(err.message); }
    finally { setBusy(null); }
  };

  const marketCards = collectMarketCards(seen, items);

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
      {marketCards.map(card => (
        <MarketCard
          key={`m-${card.id}`}
          card={card}
          serverUrl={server.url}
          busy={busy === `card-${card.id}`}
          canAfford={dust >= cardPrice(card)}
          onBuy={() => handleBuyCard(card)}
        />
      ))}
    </div>
  );
}
