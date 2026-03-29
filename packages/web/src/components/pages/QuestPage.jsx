/**
 * @file Quest page — browse daily card decks and collect media.
 */

import { useState, useEffect, useCallback } from 'react';
import { MEDIA_TYPE, words } from '@photo-quest/shared';
import { fetchQuestDecks, fetchQuestDeck, advanceQuestDeck, takeQuestCard, infuseMedia, getMediaUrl } from '../../utils/api.js';
import { Button, Spinner } from '../ui/index.js';
import { EmptyState } from '../layout/index.js';

function DeckGrid({ decks, onPickDeck }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
      {decks.map(deck => (
        <button
          key={deck.id}
          className="relative aspect-[3/4] rounded-xl bg-gradient-to-br from-indigo-700 to-purple-800 border-2 border-indigo-500/40 hover:border-indigo-400 hover:scale-105 transition-all cursor-pointer flex flex-col items-center justify-center gap-2 shadow-lg hover:shadow-indigo-500/20"
          onClick={() => onPickDeck(deck.id)}
        >
          <span className="text-4xl">&#127183;</span>
          <span className="text-white font-bold text-lg">Deck {deck.deckIndex + 1}</span>
          <span className="text-indigo-200 text-xs">
            {deck.currentPosition}/{deck.totalCards} viewed
          </span>
        </button>
      ))}
    </div>
  );
}

function CardViewer({ deck, onNext, onTake, onInfuse, taking, infusing }) {
  const card = deck.currentCard;
  if (!card) return null;

  const isImage = card.type === MEDIA_TYPE.IMAGE;
  const mediaUrl = getMediaUrl(card);
  const takeCost = deck.takeCost || 0;
  const canTake = deck.canTake !== false;
  const takeLabel = takeCost === 0
    ? words.takeFree
    : `${words.takeCard} (${takeCost} ${words.dustSymbol})`;
  const canAffordTake = canTake && (takeCost === 0 || deck.dust >= takeCost);

  const infusion = card.infusion || 0;

  return (
    <div className="flex flex-col items-center gap-4">
      {/* Card */}
      <div className="w-full max-w-sm">
        <div className="relative rounded-2xl bg-gray-900 border border-gray-700 shadow-[0_8px_32px_rgba(0,0,0,0.5)] overflow-hidden">
          {/* Card top — info strip */}
          <div className="flex items-center justify-between px-4 py-2 bg-gray-800/80 border-b border-gray-700">
            <span className="text-gray-400 text-xs">{deck.currentPosition + 1} / {deck.totalCards}</span>
            <span className="text-purple-300 text-xs font-medium">{words.dustSymbol} {infusion}</span>
          </div>

          {/* Card art — media fitted inside with padding */}
          <div className="p-3 pb-0">
            <div className="relative aspect-square rounded-lg overflow-hidden bg-black">
              {isImage ? (
                <img
                  src={mediaUrl}
                  alt={card.title}
                  className="w-full h-full object-contain"
                />
              ) : (
                <video
                  src={mediaUrl}
                  controls
                  muted
                  playsInline
                  className="w-full h-full object-contain"
                />
              )}
            </div>
          </div>

          {/* Card bottom — title and stats */}
          <div className="px-4 py-3">
            <p className="text-white font-semibold text-sm truncate">{card.title}</p>
            <div className="flex items-center justify-between mt-1">
              <span className="text-gray-500 text-xs uppercase tracking-wide">
                {isImage ? 'Image' : 'Video'}
              </span>
              {takeCost > 0 && (
                <span className="text-yellow-400/70 text-xs">{takeCost} {words.dustSymbol}</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-3 flex-wrap justify-center">
        <Button
          variant="ghost"
          onClick={onInfuse}
          disabled={infusing || deck.dust < 1}
          title={deck.dust < 1 ? words.notEnoughDust : `${words.infuse} (1 ${words.dustSymbol})`}
        >
          {infusing ? '...' : `${words.infuse} (1 ${words.dustSymbol})`}
        </Button>
        {!deck.inInventory && (
          <Button
            onClick={onTake}
            disabled={taking || !canAffordTake}
            title={!canAffordTake ? words.notEnoughDust : takeLabel}
          >
            {taking ? words.takingCard : takeLabel}
          </Button>
        )}
        {deck.inInventory && (
          <span className="px-4 py-2 text-green-400 text-sm font-medium">{words.inInventory}</span>
        )}
        <Button variant="secondary" onClick={onNext}>
          {words.skipCard}
        </Button>
      </div>
    </div>
  );
}

export default function QuestPage() {
  const [loading, setLoading] = useState(true);
  const [decks, setDecks] = useState([]);
  const [activeDeckId, setActiveDeckId] = useState(null);
  const [activeDeck, setActiveDeck] = useState(null);
  const [taking, setTaking] = useState(false);
  const [infusing, setInfusing] = useState(false);
  const [error, setError] = useState(null);

  // Load decks
  useEffect(() => {
    fetchQuestDecks()
      .then(({ decks }) => setDecks(decks))
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  // Load active deck
  useEffect(() => {
    if (!activeDeckId) { setActiveDeck(null); return; }
    fetchQuestDeck(activeDeckId)
      .then(applyDeckResult)
      .catch(err => setError(err.message));
  }, [activeDeckId]);

  const refreshDecks = () => {
    fetchQuestDecks()
      .then(({ decks }) => setDecks(decks))
      .catch(err => setError(err.message));
  };

  const applyDeckResult = (result) => {
    if (result.exhausted) {
      setActiveDeckId(null);
      refreshDecks();
    } else {
      setActiveDeck(result);
    }
  };

  const handleNext = useCallback(async () => {
    try {
      applyDeckResult(await advanceQuestDeck(activeDeckId));
    } catch (err) {
      setError(err.message);
    }
  }, [activeDeckId]);

  const handleTake = async () => {
    setTaking(true);
    try {
      applyDeckResult(await takeQuestCard(activeDeckId));
      window.dispatchEvent(new Event('dust-changed'));
    } catch (err) {
      setError(err.message);
    } finally {
      setTaking(false);
    }
  };

  const handleInfuse = async () => {
    if (!activeDeck?.currentCard) return;
    setInfusing(true);
    try {
      await infuseMedia(activeDeck.currentCard.id);
      const data = await fetchQuestDeck(activeDeckId);
      applyDeckResult(data);
      window.dispatchEvent(new Event('dust-changed'));
    } catch (err) {
      setError(err.message);
    } finally {
      setInfusing(false);
    }
  };

  useEffect(() => {
    if (!activeDeck) return;
    const onKeyDown = (e) => {
      if (e.key === 'ArrowRight') handleNext();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [activeDeck, handleNext]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] gap-3">
        <Spinner size="lg" />
        <p className="text-gray-400 text-sm">Loading quest...</p>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Daily Quest</h1>
          <p className="text-gray-400 text-sm">
            {activeDeck ? `Deck ${activeDeck.deckIndex + 1}` : `${decks.length} decks remaining`}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {activeDeck && (
            <Button variant="ghost" onClick={() => { setActiveDeckId(null); refreshDecks(); }}>
              Back
            </Button>
          )}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="mb-4 p-3 bg-red-900/30 border border-red-700/50 rounded-lg text-red-300 text-sm">
          {error}
          <Button variant="ghost" size="sm" onClick={() => setError(null)}>dismiss</Button>
        </div>
      )}

      {/* Content */}
      {activeDeck ? (
        <CardViewer
          deck={activeDeck}
          onNext={handleNext}
          onTake={handleTake}
          onInfuse={handleInfuse}
          taking={taking}
          infusing={infusing}
        />
      ) : decks.length > 0 ? (
        <DeckGrid decks={decks} onPickDeck={setActiveDeckId} />
      ) : (
        <EmptyState
          title="No decks available"
          description="All decks have been explored today. Come back tomorrow for new ones!"
        />
      )}
    </div>
  );
}
