/**
 * @file Memory card game page — flip cards to find matching pairs.
 */

import { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { MEDIA_TYPE, words, clientRoutes } from '@photo-quest/shared';
import { fetchMedia, getImageUrl, useMemoryTicket, getMemoryTickets, addToInventory } from '../../utils/api.js';
import { shuffle } from '../../utils/shuffle.js';
import { Button, Icon, MediaCard, Modal, Spinner } from '../ui/index.js';
import { ICON_CLASS } from '../ui/Icon.jsx';
import { showToast } from '../ToasterMessage.jsx';
import { notifyDustChanged } from '../../utils/events.js';
import { CARD_SIZES } from '../ui/cardSizes.js';
import ticketIcon from '../../icons/ticket2-svgrepo-com.svg';

const PAIR_COUNT = 8;
const STAR_THRESHOLDS = [15, 11, 8];
const PICKS_PER_STAR = { 1: 1, 2: 2, 3: PAIR_COUNT };

function getStars(moves) {
  return STAR_THRESHOLDS.reduce((s, t) => (moves <= t ? s + 1 : s), 0);
}

function Stars({ count, glow }) {
  return Array.from({ length: 3 }, (_, i) => (
    <span
      key={i}
      className={i < count
        ? `text-yellow-400${glow ? ' drop-shadow-[0_0_8px_rgba(250,204,21,0.7)]' : ''}`
        : 'text-gray-600'}
    >&#9733;</span>
  ));
}

function weightedPick(items, count) {
  const pool = items.map(m => ({ ...m, weight: (m.infusion || 0) + 1 }));
  const picked = [];
  for (let i = 0; i < count && pool.length > 0; i++) {
    const total = pool.reduce((s, m) => s + m.weight, 0);
    let r = Math.random() * total;
    let idx = 0;
    for (; idx < pool.length - 1; idx++) {
      r -= pool[idx].weight;
      if (r <= 0) break;
    }
    picked.push(pool[idx]);
    pool.splice(idx, 1);
  }
  return picked;
}

function buildDeck(mediaItems) {
  const images = mediaItems.filter(m => m.type === MEDIA_TYPE.IMAGE);
  if (images.length < PAIR_COUNT) return null;

  const picked = weightedPick(images, PAIR_COUNT);
  const cards = [];

  for (const media of picked) {
    cards.push({ id: `${media.id}-a`, mediaId: media.id, pairKey: media.id });
    cards.push({ id: `${media.id}-b`, mediaId: media.id, pairKey: media.id });
  }

  return shuffle(cards);
}

function CardBack() {
  return (
    <div className={`absolute inset-0 bg-gradient-to-br from-blue-600 to-purple-700 ${CARD_SIZES.small.rounding} flex items-center justify-center`}>
      <span className="text-3xl select-none">?</span>
    </div>
  );
}

function CardFace({ mediaId, onLoad }) {
  return (
    <div className={`absolute inset-0 ${CARD_SIZES.small.rounding} overflow-hidden`}>
      <img
        src={getImageUrl(mediaId)}
        alt=""
        className="w-full h-full object-cover"
        draggable={false}
        onLoad={onLoad}
      />
    </div>
  );
}

function MemoryCard({ card, flipped, matched, picked, picking, onClick, onImageLoad }) {
  const isRevealed = flipped || matched;

  return (
    <button
      className={`
        relative ${CARD_SIZES.small.art} ${CARD_SIZES.small.rounding} cursor-pointer transition-all duration-200
        ${matched ? 'ring-2 ring-green-400 opacity-80' : ''}
        ${picked ? 'ring-3 ring-yellow-400 scale-95 opacity-100' : ''}
        ${picking && !picked ? 'hover:ring-2 hover:ring-yellow-400/50 hover:scale-105' : ''}
        ${!matched && !flipped && !picking ? 'hover:scale-105' : ''}
        focus:outline-none focus:ring-2 focus:ring-blue-400
      `}
      onClick={onClick}
      disabled={matched && !picking}
    >
      {isRevealed ? <CardFace mediaId={card.mediaId} onLoad={onImageLoad} /> : <CardBack />}
    </button>
  );
}


export default function MemoryGamePage() {
  const navigate = useNavigate();
  const location = useLocation();
  const ticketIdRef = useRef(location.state?.ticketId ?? null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [cards, setCards] = useState([]);
  const [flipped, setFlipped] = useState([]);
  const [matched, setMatched] = useState(new Set());
  const [moves, setMoves] = useState(0);
  const lockRef = useRef(false);
  const flipTimeoutRef = useRef(null);
  const pendingMismatchRef = useRef(false);

  const [hasTicket, setHasTicket] = useState(null);
  const mediaMapRef = useRef(new Map());

  /* Picking phase state */
  const [picking, setPicking] = useState(false);
  const [picksAllowed, setPicksAllowed] = useState(0);
  const [pickedIds, setPickedIds] = useState(new Set());
  const [picksDone, setPicksDone] = useState(false);
  const [picksAdded, setPicksAdded] = useState(0);

  const won = cards.length > 0 && matched.size === PAIR_COUNT;
  const stars = won ? getStars(moves) : 0;

  const startGame = async () => {
    clearTimeout(flipTimeoutRef.current);
    mediaMapRef.current = new Map();
    setLoading(true);
    setError(null);
    setFlipped([]);
    setMatched(new Set());
    setMoves(0);
    setPicking(false);
    setPicksAllowed(0);
    setPickedIds(new Set());
    setPicksDone(false);
    setPicksAdded(0);
    lockRef.current = false;
    pendingMismatchRef.current = false;

    try {
      const ticketId = ticketIdRef.current;
      ticketIdRef.current = null;
      const ticketResult = await useMemoryTicket(ticketId || undefined).catch(() => null);
      if (!ticketResult) {
        setHasTicket(false);
        setError('No tickets. Buy one from the Market and find it in your Inventory.');
        setLoading(false);
        return;
      }
      setHasTicket(ticketResult.tickets > 0);

      const { items } = await fetchMedia();
      mediaMapRef.current = new Map(items.map(m => [m.id, m]));
      const deck = buildDeck(items);
      if (!deck) {
        setError('Need at least 8 images in your library to play.');
        setLoading(false);
        return;
      }
      const uniqueIds = [...new Set(deck.map(c => c.mediaId))];
      await Promise.all(uniqueIds.map(id => {
        const img = new Image();
        img.src = getImageUrl(id);
        return img.decode().catch(() => {});
      }));
      setCards(deck);
    } catch (err) {
      setError('Failed to load media: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const mountedRef = useRef(false);
  useEffect(() => { if (!mountedRef.current) { mountedRef.current = true; startGame(); } }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /* Enter picking phase when won */
  useEffect(() => {
    if (!won || picking || picksDone) return;
    const s = getStars(moves);
    const allowed = PICKS_PER_STAR[s] || 1;
    setPicking(true);
    setPicksAllowed(allowed);
    showToast(`Pick ${allowed} card${allowed !== 1 ? 's' : ''} for your inventory`);
  }, [won]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleClick = (card) => {
    /* Picking phase — player selects reward cards */
    if (picking) {
      if (!matched.has(card.pairKey)) return;
      if (pickedIds.has(card.mediaId)) return;
      if (pickedIds.size >= picksAllowed) return;

      const next = new Set(pickedIds);
      next.add(card.mediaId);
      setPickedIds(next);

      addToInventory(card.mediaId, { infuseBonus: 10 }).then(({ added }) => {
        if (added) setPicksAdded(prev => prev + 1);
      }).catch(() => showToast('Failed to add card', 'error'));

      if (next.size >= picksAllowed) {
        finishPicking();
      }
      return;
    }

    /* Normal game phase */
    if (lockRef.current) return;
    if (matched.has(card.pairKey)) return;
    if (flipped.includes(card.id)) return;
    if (flipped.length >= 2) return;

    const newFlipped = [...flipped, card.id];
    setFlipped(newFlipped);

    if (newFlipped.length === 2) {
      setMoves(m => m + 1);
      lockRef.current = true;

      const [firstId, secondId] = newFlipped;
      const first = cards.find(c => c.id === firstId);
      const second = cards.find(c => c.id === secondId);

      if (!first || !second) {
        setFlipped([]);
        lockRef.current = false;
        return;
      }

      if (first.pairKey === second.pairKey) {
        setMatched(prev => {
          const next = new Set(prev);
          next.add(first.pairKey);
          return next;
        });
        setFlipped([]);
        lockRef.current = false;
      } else {
        pendingMismatchRef.current = true;
      }
    }
  };

  const finishPicking = () => {
    setPicking(false);
    setPicksDone(true);
    notifyDustChanged();
    getMemoryTickets().then(({ tickets }) => setHasTicket(tickets > 0)).catch(() => {});
  };

  const handleImageLoad = () => {
    if (!pendingMismatchRef.current) return;
    pendingMismatchRef.current = false;
    flipTimeoutRef.current = setTimeout(() => {
      setFlipped([]);
      lockRef.current = false;
    }, 800);
  };

  useEffect(() => {
    return () => clearTimeout(flipTimeoutRef.current);
  }, []);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] gap-3">
        <Spinner size="lg" />
        <p className="text-gray-400 text-sm">Loading game...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] gap-4">
        <p className="text-red-400">{error}</p>
        <Button variant="secondary" onClick={() => navigate(clientRoutes.inventory)}>
          Back to Inventory
        </Button>
      </div>
    );
  }

  const picksRemaining = picksAllowed - pickedIds.size;

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-lg mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white"><img src={ticketIcon} alt="" className={`invert ${ICON_CLASS.pageHeader}`} />Memory Game</h1>
          <p className="text-gray-400 text-sm">Moves: {moves}</p>
        </div>
      </div>

      <Modal open={picksDone} closable={false}>
        <div className="text-center space-y-3">
          <p className="text-3xl tracking-widest">
            <Stars count={stars} glow />
          </p>
          <p className="text-green-300 text-xl font-semibold">
            You won in {moves} moves!
          </p>
          {pickedIds.size > 0 && (
            <div className="flex gap-2 justify-center">
              {[...pickedIds].map(mediaId => {
                const item = mediaMapRef.current.get(mediaId);
                return item ? <MediaCard key={mediaId} item={item} /> : null;
              })}
            </div>
          )}
          <p className="text-gray-300 text-sm">
            {picksAdded > 0
              ? `${picksAdded} card${picksAdded !== 1 ? 's' : ''} added to inventory`
              : 'Cards already in inventory'}
          </p>
          <div className="flex gap-3 justify-center pt-2">
            {hasTicket && (
              <Button onClick={startGame}>
                <img src={ticketIcon} alt="" className="w-4 h-4 invert inline-block mr-1.5 -mt-0.5" />
                Play again
              </Button>
            )}
            <Button variant="secondary" onClick={() => navigate(clientRoutes.inventory)}>
              Inventory
            </Button>
          </div>
        </div>
      </Modal>

      <div className="grid grid-cols-4 gap-3">
        {cards.map(card => (
          <MemoryCard
            key={card.id}
            card={card}
            flipped={flipped.includes(card.id)}
            matched={matched.has(card.pairKey)}
            picked={pickedIds.has(card.mediaId)}
            picking={picking}
            onClick={() => handleClick(card)}
            onImageLoad={handleImageLoad}
          />
        ))}
      </div>
    </div>
  );
}
