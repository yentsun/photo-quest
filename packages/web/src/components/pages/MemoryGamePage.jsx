/**
 * @file Memory card game page — flip cards to find matching pairs.
 */

import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { MEDIA_TYPE } from '@photo-quest/shared';
import { fetchMedia, getImageUrl, getStreamUrl } from '../../utils/api.js';
import { shuffle } from '../../utils/shuffle.js';
import { Button, Spinner } from '../ui/index.js';

const GRID_SIZE = 9; // 3x3
const PAIR_COUNT = 4; // 4 pairs + 1 solo = 9 cards

/**
 * Pick random images, build card deck with pairs.
 * Returns 9 cards: 4 pairs + 1 solo, shuffled.
 */
function buildDeck(mediaItems) {
  const images = mediaItems.filter(m => m.type === MEDIA_TYPE.IMAGE);
  if (images.length < PAIR_COUNT + 1) return null;

  const picked = shuffle(images).slice(0, PAIR_COUNT + 1);
  const cards = [];

  // First 4 images get duplicated (pairs)
  for (let i = 0; i < PAIR_COUNT; i++) {
    const media = picked[i];
    cards.push({ id: `${media.id}-a`, mediaId: media.id, pairKey: media.id });
    cards.push({ id: `${media.id}-b`, mediaId: media.id, pairKey: media.id });
  }

  // 5th image is the solo (free) card — matches itself
  const solo = picked[PAIR_COUNT];
  cards.push({ id: `${solo.id}-solo`, mediaId: solo.id, pairKey: `solo-${solo.id}` });

  return shuffle(cards);
}

function CardBack() {
  return (
    <div className="absolute inset-0 bg-gradient-to-br from-blue-600 to-purple-700 rounded-lg flex items-center justify-center">
      <span className="text-3xl select-none">?</span>
    </div>
  );
}

function CardFace({ mediaId }) {
  return (
    <div className="absolute inset-0 rounded-lg overflow-hidden">
      <img
        src={getImageUrl(mediaId)}
        alt=""
        className="w-full h-full object-cover"
        draggable={false}
      />
    </div>
  );
}

function Card({ card, flipped, matched, onClick }) {
  const isRevealed = flipped || matched;

  return (
    <button
      className={`
        relative aspect-square rounded-lg cursor-pointer transition-transform duration-200
        ${matched ? 'ring-2 ring-green-400 opacity-80' : ''}
        ${!matched && !flipped ? 'hover:scale-105' : ''}
        focus:outline-none focus:ring-2 focus:ring-blue-400
      `}
      onClick={onClick}
      disabled={matched}
    >
      {isRevealed ? <CardFace mediaId={card.mediaId} /> : <CardBack />}
    </button>
  );
}

export default function MemoryGamePage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [cards, setCards] = useState([]);
  const [flipped, setFlipped] = useState([]); // card ids currently face-up
  const [matched, setMatched] = useState(new Set()); // matched pair keys
  const [moves, setMoves] = useState(0);
  const [won, setWon] = useState(false);
  const lockRef = useRef(false);

  const startGame = async () => {
    setLoading(true);
    setError(null);
    setFlipped([]);
    setMatched(new Set());
    setMoves(0);
    setWon(false);
    lockRef.current = false;

    try {
      const { items } = await fetchMedia();
      const deck = buildDeck(items);
      if (!deck) {
        setError('Need at least 5 images in your library to play.');
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

  const handleClick = (card) => {
    if (lockRef.current) return;
    if (matched.has(card.pairKey)) return;
    if (flipped.includes(card.id)) return;

    const newFlipped = [...flipped, card.id];
    setFlipped(newFlipped);

    // Solo card — auto-match on first click
    if (String(card.pairKey).startsWith('solo-')) {
      setMatched(prev => {
        const next = new Set(prev);
        next.add(card.pairKey);
        return next;
      });
      setMoves(m => m + 1);
      setFlipped([]);
      return;
    }

    if (newFlipped.length === 2) {
      setMoves(m => m + 1);
      lockRef.current = true;

      const [firstId, secondId] = newFlipped;
      const first = cards.find(c => c.id === firstId);
      const second = cards.find(c => c.id === secondId);

      if (first.pairKey === second.pairKey) {
        setMatched(prev => {
          const next = new Set(prev);
          next.add(first.pairKey);
          return next;
        });
        setFlipped([]);
        lockRef.current = false;
      } else {
        // No match — flip back after delay
        setTimeout(() => {
          setFlipped([]);
          lockRef.current = false;
        }, 800);
      }
    }
  };

  // Check win condition
  useEffect(() => {
    if (cards.length > 0 && matched.size === PAIR_COUNT + 1) {
      setWon(true);
    }
  }, [matched, cards.length]);

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
        <Button variant="secondary" onClick={() => navigate('/dashboard')}>
          Back to Library
        </Button>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-lg mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Memory Game</h1>
          <p className="text-gray-400 text-sm">Moves: {moves}</p>
        </div>
        <Button variant="secondary" onClick={startGame}>
          New Game
        </Button>
      </div>

      {/* Win message */}
      {won && (
        <div className="mb-6 p-4 bg-green-900/30 border border-green-700/50 rounded-lg text-center">
          <p className="text-green-300 text-lg font-semibold">
            You won in {moves} moves!
          </p>
        </div>
      )}

      {/* 3x3 Grid */}
      <div className="grid grid-cols-3 gap-3">
        {cards.map(card => (
          <Card
            key={card.id}
            card={card}
            flipped={flipped.includes(card.id)}
            matched={matched.has(card.pairKey)}
            onClick={() => handleClick(card)}
          />
        ))}
      </div>
    </div>
  );
}
