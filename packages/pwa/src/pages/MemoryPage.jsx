/**
 * @file Memory card game — 8 pairs, flip to match.
 *
 * Server serves the deck once (POST /memory/start — needs library
 * access); after that gameplay is entirely local (LAW 1.39). Rewards
 * post each picked card to /inventory.
 */

import { useEffect, useRef, useState } from 'react';
import { words } from '@photo-quest/shared';
import Button from '../components/ui/Button.jsx';
import Spinner from '../components/ui/Spinner.jsx';
import { useLocalStore } from '../hooks/useLocalStore.js';
import { STORES } from '../db/localDb.js';
import { patchMemoryState, claimMemoryPick, endMemory } from '../db/actions.js';
import { mediaUrl as buildMediaUrl } from '../utils/mediaUrl.js';
import './MemoryPage.css';

const STAR_THRESHOLDS = [15, 11, 8];  /* 1★/2★/3★ move caps — for prestige only */
const PICKS_PER_WIN   = 1;            /* winning earns exactly one reward card, regardless of stars */
const FLIP_BACK_MS    = 800;

function starsFromMoves(moves) {
  return STAR_THRESHOLDS.reduce((s, t) => (moves <= t ? s + 1 : s), 0);
}

function Stars({ count }) {
  return (
    <span className="memory__stars">
      {[0, 1, 2].map(i => (
        <span key={i} className={i < count ? 'memory__star memory__star--on' : 'memory__star'}>★</span>
      ))}
    </span>
  );
}

function MemoryCard({ card, revealed, matched, picking, pickable, picked, serverUrl, onClick }) {
  const classes = [
    'memory__card',
    revealed || matched ? 'memory__card--face' : 'memory__card--back',
    matched && !picking ? 'memory__card--matched' : '',
    picking && pickable ? 'memory__card--pickable' : '',
    picked ? 'memory__card--picked' : '',
  ].filter(Boolean).join(' ');
  return (
    <button className={classes} onClick={onClick} type="button">
      {revealed || matched
        ? <img src={buildMediaUrl(serverUrl, { id: card.mediaId, type: card.type })} alt="" draggable={false} />
        : <span className="memory__back">?</span>}
    </button>
  );
}

export default function MemoryPage({ server, onBack }) {
  const rows  = useLocalStore(STORES.MEMORY_STATE);
  const state = rows?.find(r => r.id === 1);

  const [flipped, setFlipped] = useState([]);  /* card.id(s) currently face-up but unmatched */
  const [picks,   setPicks]   = useState([]);  /* mediaIds picked in reward phase */
  const flipTimer = useRef(null);

  useEffect(() => () => clearTimeout(flipTimer.current), []);

  /* Preload all face images once — avoids a flash on first flip. */
  useEffect(() => {
    if (!state?.cards || !server) return;
    const seen = new Set();
    for (const c of state.cards) {
      if (seen.has(c.mediaId)) continue;
      seen.add(c.mediaId);
      const img = new Image();
      img.src = buildMediaUrl(server.url, { id: c.mediaId, type: c.type });
    }
  }, [state?.cards, server]);

  /* Loading either because useLocalStore hasn't finished the initial read
   * (rows === null) or because startMemory() hasn't written the placeholder
   * yet (rows loaded but state undefined) or the placeholder itself says
   * phase === 'loading'. All three cases: show the spinner. */
  if (!state || state.phase === 'loading') {
    return (
      <div className="memory">
        <header className="memory__header">
          <h1>🃏 Memory Game</h1>
          <Button variant="ghost" onClick={onBack}>Back</Button>
        </header>
        <Spinner label="Forming game…" />
      </div>
    );
  }

  if (state.phase === 'error') {
    return (
      <div className="memory">
        <header className="memory__header">
          <h1>🃏 Memory Game</h1>
          <Button variant="ghost" onClick={onBack}>Back</Button>
        </header>
        <p className="memory__hint" style={{ color: '#fca5a5' }}>{state.error || 'Failed to start game.'}</p>
      </div>
    );
  }

  const cards   = state.cards || [];
  const matched = new Set(state.matched || []);
  const moves   = state.moves || 0;
  const won     = matched.size === (state.pairCount || 8);
  const stars   = won ? starsFromMoves(moves) : 0;
  const picksAllowed = won ? PICKS_PER_WIN : 0;
  const picksRemaining = picksAllowed - picks.length;
  const picking = won && picksRemaining > 0;

  const handleCardClick = (card) => {
    if (picking) {
      if (!matched.has(card.pairKey)) return;
      if (picks.includes(card.mediaId)) return;
      const next = [...picks, card.mediaId];
      setPicks(next);
      claimMemoryPick(card.mediaId, card).catch(err => console.warn('pick failed', err));
      return;
    }
    if (won) return;
    if (flipped.includes(card.id)) return;
    if (matched.has(card.pairKey)) return;
    if (flipped.length >= 2) return;

    const next = [...flipped, card.id];
    setFlipped(next);
    if (next.length < 2) return;

    const [a, b] = next.map(id => cards.find(c => c.id === id));
    const isMatch = a && b && a.pairKey === b.pairKey;

    if (isMatch) {
      const newMatched = [...matched, a.pairKey];
      patchMemoryState({ moves: moves + 1, matched: newMatched });
      setFlipped([]);
    } else {
      patchMemoryState({ moves: moves + 1 });
      clearTimeout(flipTimer.current);
      flipTimer.current = setTimeout(() => setFlipped([]), FLIP_BACK_MS);
    }
  };

  const handleExit = async () => {
    await endMemory();
    onBack?.();
  };

  const showFinale = won && picks.length >= picksAllowed;

  return (
    <div className="memory">
      <header className="memory__header">
        <h1>🃏 Memory Game</h1>
        <div className="memory__meta">
          <span>Moves: {moves}</span>
          {won && <Stars count={stars} />}
        </div>
        <Button variant="ghost" onClick={handleExit}>{won ? 'Done' : 'Leave'}</Button>
      </header>

      {picking && (
        <p className="memory__hint">
          Pick {picksRemaining} card{picksRemaining !== 1 ? 's' : ''} — each adds <strong>+10 {words.dustSymbol}</strong> infusion.
        </p>
      )}

      <div className="memory__grid">
        {cards.map(card => (
          <MemoryCard
            key={card.id}
            card={card}
            revealed={flipped.includes(card.id)}
            matched={matched.has(card.pairKey)}
            picking={picking}
            pickable={matched.has(card.pairKey) && !picks.includes(card.mediaId)}
            picked={picks.includes(card.mediaId)}
            serverUrl={server.url}
            onClick={() => handleCardClick(card)}
          />
        ))}
      </div>

      {showFinale && (
        <div className="memory__finale">
          <p>
            {stars === 3 ? 'Perfect!' : stars === 2 ? 'Nicely done.' : 'Squeaked it.'}
            {' '}
            {picks.length} card{picks.length !== 1 ? 's' : ''} added to inventory.
          </p>
          <Button onClick={handleExit}>Back to inventory</Button>
        </div>
      )}
    </div>
  );
}
