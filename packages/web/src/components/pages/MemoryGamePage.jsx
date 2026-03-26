/**
 * @file Memory card game page — flip cards to find matching pairs.
 */

import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { MEDIA_TYPE } from '@photo-quest/shared';
import { fetchMedia, getImageUrl, getMediaUrl } from '../../utils/api.js';
import { shuffle } from '../../utils/shuffle.js';
import { Button, Spinner } from '../ui/index.js';

const PAIR_COUNT = 8;
const STAR_THRESHOLDS = [15, 11, 8];

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
  const [flipped, setFlipped] = useState([]);
  const [matched, setMatched] = useState(new Set());
  const [moves, setMoves] = useState(0);
  const [reward, setReward] = useState(null);
  const lockRef = useRef(false);
  const flipTimeoutRef = useRef(null);
  const videoRef = useRef(null);

  const won = cards.length > 0 && matched.size === PAIR_COUNT;
  const stars = won ? getStars(moves) : 0;

  const startGame = async () => {
    clearTimeout(flipTimeoutRef.current);
    setLoading(true);
    setError(null);
    setFlipped([]);
    setMatched(new Set());
    setMoves(0);
    setReward(null);
    lockRef.current = false;

    try {
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

  const handleClick = (card) => {
    if (lockRef.current) return;
    if (matched.has(card.pairKey)) return;
    if (flipped.includes(card.id)) return;

    const newFlipped = [...flipped, card.id];
    setFlipped(newFlipped);

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
        flipTimeoutRef.current = setTimeout(() => {
          setFlipped([]);
          lockRef.current = false;
        }, 800);
      }
    }
  };

  useEffect(() => {
    if (!won) return;
    const s = getStars(moves);
    fetchMedia({ liked: true }).then(({ items }) => {
      const liked = items.filter(m => m.likes > 0);
      if (liked.length === 0) return;
      const sorted = liked.toSorted((a, b) => b.likes - a.likes);
      const tier = s === 3 ? 0 : s === 2 ? 0.5 : 1;
      const index = Math.min(Math.floor(tier * (sorted.length - 1)), sorted.length - 1);
      setReward(sorted[index]);
    }).catch(() => {});
  }, [won, moves]);

  useEffect(() => {
    return () => {
      clearTimeout(flipTimeoutRef.current);
      if (videoRef.current) {
        videoRef.current.pause();
        videoRef.current.removeAttribute('src');
        videoRef.current.load();
      }
    };
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
        <Button variant="secondary" onClick={() => navigate('/dashboard')}>
          Back to Library
        </Button>
      </div>
    );
  }

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

      {reward && (
        <div
          className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/90 animate-fade-in cursor-pointer"
          onClick={() => setReward(null)}
        >
          <div className="text-4xl tracking-widest mb-4 animate-bounce-in">
            <Stars count={stars} glow />
          </div>
          <p className="text-green-300 text-xl font-semibold mb-6 animate-fade-in-delayed">
            You won in {moves} moves!
          </p>
          {reward.type === MEDIA_TYPE.IMAGE ? (
            <img
              src={getMediaUrl(reward)}
              alt={reward.title}
              className="max-w-[90vw] max-h-[70vh] rounded-xl object-contain shadow-2xl shadow-blue-500/20 animate-scale-in"
            />
          ) : (
            <video
              ref={videoRef}
              src={getMediaUrl(reward)}
              autoPlay
              loop
              muted
              playsInline
              className="max-w-[90vw] max-h-[70vh] rounded-xl object-contain shadow-2xl shadow-blue-500/20 animate-scale-in"
              onClick={(e) => e.stopPropagation()}
            />
          )}
          <p className="text-gray-500 text-sm mt-6 animate-fade-in-delayed">Click anywhere to continue</p>
        </div>
      )}

      {won && !reward && (
        <div className="mb-6 p-4 bg-green-900/30 border border-green-700/50 rounded-lg text-center space-y-2">
          <p className="text-2xl tracking-widest">
            <Stars count={stars} />
          </p>
          <p className="text-green-300 text-lg font-semibold">
            You won in {moves} moves!
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
            onClick={() => handleClick(card)}
          />
        ))}
      </div>
    </div>
  );
}
