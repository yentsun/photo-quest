/**
 * @file Quest page — view a quest deck and collect media cards.
 *
 * Always entered from inventory with a deckId in route state.
 */

import { useState, useEffect, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { MEDIA_TYPE, words, clientRoutes } from '@photo-quest/shared';
import { fetchQuestDeck, advanceQuestDeck, takeQuestCard, freeInfuseMedia, getMediaUrl } from '../../utils/api.js';
import { Button, Spinner } from '../ui/index.js';

function CardViewer({ deck, onNext, onTake, onInfusionUpdate, taking }) {
  const card = deck.currentCard;
  const [localInfusion, setLocalInfusion] = useState(card?.infusion || 0);

  useEffect(() => { setLocalInfusion(card?.infusion || 0); }, [card?.id]);

  useEffect(() => {
    if (!card) return;
    const startTime = Date.now();
    const interval = setInterval(() => {
      if (Date.now() - startTime >= 120000) { clearInterval(interval); return; }
      freeInfuseMedia(card.id, 1)
        .then(({ media }) => {
          setLocalInfusion(media.infusion);
          if (onInfusionUpdate) onInfusionUpdate();
        })
        .catch(() => {});
    }, 5000);
    return () => clearInterval(interval);
  }, [card?.id]);

  if (!card) return null;

  const isImage = card.type === MEDIA_TYPE.IMAGE;
  const mediaUrl = getMediaUrl(card);
  const takeCost = deck.takeCost || 0;
  const canTake = deck.canTake !== false;
  const takeLabel = takeCost === 0
    ? words.takeFree
    : `${words.takeCard} (${takeCost} ${words.dustSymbol})`;
  const canAffordTake = canTake && (takeCost === 0 || deck.dust >= takeCost);

  const infusion = localInfusion;

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="w-full max-w-sm">
        <div className="relative rounded-2xl bg-gray-900 border border-gray-700 shadow-[0_8px_32px_rgba(0,0,0,0.5)] overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2 bg-gray-800/80 border-b border-gray-700">
            <span className="text-gray-400 text-xs">{deck.currentPosition + 1} / {deck.totalCards}</span>
            <span className="text-purple-300 text-xs font-medium">{words.dustSymbol} {infusion}</span>
          </div>
          <div className="p-3 pb-0">
            <div className="relative aspect-[5/7] rounded-lg overflow-hidden bg-black">
              {isImage ? (
                <img src={mediaUrl} alt={card.title} className="w-full h-full object-cover" />
              ) : (
                <video src={mediaUrl} controls muted playsInline className="w-full h-full object-cover" />
              )}
            </div>
          </div>
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

      <div className="flex gap-3 flex-wrap justify-center">
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
  const location = useLocation();
  const navigate = useNavigate();
  const deckId = location.state?.deckId;
  const [activeDeck, setActiveDeck] = useState(null);
  const [taking, setTaking] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!deckId) {
      navigate(clientRoutes.inventory);
      return;
    }
    fetchQuestDeck(deckId)
      .then(result => {
        if (result.exhausted) navigate(clientRoutes.inventory);
        else setActiveDeck(result);
      })
      .catch(err => setError(err.message));
  }, [deckId]);

  const applyDeckResult = (result) => {
    if (result.exhausted) {
      navigate(clientRoutes.inventory);
    } else {
      setActiveDeck(result);
    }
  };

  const handleNext = useCallback(async () => {
    try {
      applyDeckResult(await advanceQuestDeck(deckId));
    } catch (err) {
      setError(err.message);
    }
  }, [deckId]);

  const handleTake = async () => {
    setTaking(true);
    try {
      applyDeckResult(await takeQuestCard(deckId));
      window.dispatchEvent(new Event('dust-changed'));
    } catch (err) {
      setError(err.message);
    } finally {
      setTaking(false);
    }
  };

  const handlePassiveInfusionUpdate = useCallback(async () => {
    if (!deckId) return;
    const data = await fetchQuestDeck(deckId).catch(() => null);
    if (data && !data.exhausted) setActiveDeck(data);
  }, [deckId]);

  useEffect(() => {
    if (!activeDeck) return;
    const onKeyDown = (e) => {
      if (e.key === 'ArrowRight') handleNext();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [activeDeck, handleNext]);

  if (!activeDeck) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] gap-3">
        <Spinner size="lg" />
        <p className="text-gray-400 text-sm">Loading quest...</p>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Daily Quest</h1>
          <p className="text-gray-400 text-sm">Deck {activeDeck.deckIndex + 1}</p>
        </div>
        <Button variant="ghost" onClick={() => navigate(clientRoutes.inventory)}>
          Back
        </Button>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-900/30 border border-red-700/50 rounded-lg text-red-300 text-sm">
          {error}
          <Button variant="ghost" size="sm" onClick={() => setError(null)}>dismiss</Button>
        </div>
      )}

      <CardViewer
        deck={activeDeck}
        onNext={handleNext}
        onTake={handleTake}
        onInfusionUpdate={handlePassiveInfusionUpdate}
        taking={taking}
      />
    </div>
  );
}
