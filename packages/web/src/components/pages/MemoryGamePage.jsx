/**
 * @file Memory card game page — flip cards to find matching pairs.
 */

import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { MEDIA_TYPE, words } from '@photo-quest/shared';
import { fetchMedia, getImageUrl, useMemoryTicket, getMemoryTickets } from '../../utils/api.js';
import { shuffle } from '../../utils/shuffle.js';
import { Button, Spinner } from '../ui/index.js';

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

function buildDeck(mediaItems) {
  const images = mediaItems.filter(m => m.type === MEDIA_TYPE.IMAGE);
  if (images.length < PAIR_COUNT) return null;

  const picked = shuffle(images).slice(0, PAIR_COUNT);
  const cards = [];

  for (const media of picked) {
    cards.push({ id: `${media.id}-a`, mediaId: media.id, pairKey: media.id });
    cards.push({ id: `${media.id}-b`, mediaId: media.id, pairKey: media.id });
  }

  return shuffle(cards);
}

function CardBack() {
  return (
    <div className="absolute inset-0 bg-gradient-to-br from-blue-600 to-purple-700 rounded-lg flex items-center justify-center">
      <span className="text-3xl select-none">?</span>
    </div>
  );
}

function CardFace({ mediaId, onLoad }) {
  return (
    <div className="absolute inset-0 rounded-lg overflow-hidden">
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

function Card({ card, flipped, matched, picked, picking, onClick, onImageLoad }) {
  const isRevealed = flipped || matched;

  return (
    <button
      className={`
        relative aspect-square rounded-lg cursor-pointer transition-all duration-200
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

async function addCardToInventory(mediaId) {
  const res = await fetch('/inventory', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mediaId }),
  });
  return res.status === 201;
}

export default function MemoryGamePage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [cards, setCards] = useState([]);
  const [flipped, setFlipped] = useState([]);
  const [matched, setMatched] = useState(new Set());
  const [moves, setMoves] = useState(0);
  const lockRef = useRef(false);
  const flipTimeoutRef = useRef(null);
  const pendingMismatchRef = useRef(false);

  const startedRef = useRef(false);
  const [hasTicket, setHasTicket] = useState(null);

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
    startedRef.current = false;
    lockRef.current = false;
    pendingMismatchRef.current = false;

    try {
      const { tickets } = await getMemoryTickets();
      setHasTicket(tickets > 0);
      if (tickets === 0) {
        setError('No tickets. Buy one from the Market.');
        setLoading(false);
        return;
      }

      const { items } = await fetchMedia();
      const deck = buildDeck(items);
      if (!deck) {
        setError('Need at least 8 images in your library to play.');
        setLoading(false);
        return;
      }
      setCards(deck);
    } catch (err) {
      setError('Failed to load media: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { startGame(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /* Enter picking phase when won */
  useEffect(() => {
    if (!won || picking || picksDone) return;
    const s = getStars(moves);
    const allowed = PICKS_PER_STAR[s] || 1;
    setPicking(true);
    setPicksAllowed(allowed);
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

      addCardToInventory(card.mediaId).then(added => {
        if (added) setPicksAdded(prev => prev + 1);
      }).catch(() => {});

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

    if (!startedRef.current) {
      startedRef.current = true;
      useMemoryTicket().catch(() => {});
    }

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
    window.dispatchEvent(new Event('dust-changed'));
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
        <Button variant="secondary" onClick={() => navigate('/quest')}>
          Back to Quest
        </Button>
      </div>
    );
  }

  const picksRemaining = picksAllowed - pickedIds.size;

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-lg mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Memory Game</h1>
          <p className="text-gray-400 text-sm">Moves: {moves}</p>
        </div>
        <Button variant="secondary" onClick={startGame}>
          New Game
        </Button>
      </div>

      {/* Picking phase banner */}
      {picking && (
        <div className="mb-6 p-4 bg-yellow-900/30 border border-yellow-600/50 rounded-lg text-center space-y-2">
          <p className="text-2xl tracking-widest">
            <Stars count={stars} glow />
          </p>
          <p className="text-yellow-200 text-lg font-semibold">
            Pick {picksRemaining} card{picksRemaining !== 1 ? 's' : ''} for your inventory
          </p>
        </div>
      )}

      {/* Done banner */}
      {picksDone && (
        <div className="mb-6 p-4 bg-green-900/30 border border-green-700/50 rounded-lg text-center space-y-2">
          <p className="text-2xl tracking-widest">
            <Stars count={stars} glow />
          </p>
          <p className="text-green-300 text-lg font-semibold">
            You won in {moves} moves!
          </p>
          <p className="text-gray-300 text-sm">
            {picksAdded > 0
              ? `${picksAdded} card${picksAdded !== 1 ? 's' : ''} added to inventory`
              : 'Cards already in inventory'}
          </p>
        </div>
      )}

      <div className="grid grid-cols-4 gap-3">
        {cards.map(card => (
          <Card
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
