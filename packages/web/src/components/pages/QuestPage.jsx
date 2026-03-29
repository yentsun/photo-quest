/**
 * @file Quest page — browse daily card decks and collect media.
 */

import { useState, useEffect } from 'react';
import { QUEST_CARD_COST, MEDIA_TYPE } from '@photo-quest/shared';
import { fetchQuestDecks, fetchQuestDeck, advanceQuestDeck, takeQuestCard, getMediaUrl } from '../../utils/api.js';
import { Button, Spinner } from '../ui/index.js';
import { EmptyState } from '../layout/index.js';

function DustBadge({ dust }) {
  return (
    <span className="inline-flex items-center gap-1 px-3 py-1 bg-purple-900/50 border border-purple-600/50 rounded-full text-purple-200 font-semibold text-sm">
      <span className="text-yellow-400">&#10022;</span>
      {dust}
    </span>
  );
}

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

function CardViewer({ deck, onNext, onTake, taking }) {
  const card = deck.currentCard;
  if (!card) return null;

  const isImage = card.type === MEDIA_TYPE.IMAGE;
  const mediaUrl = getMediaUrl(card);

  return (
    <div className="flex flex-col items-center gap-4">
      {/* Progress */}
      <div className="flex items-center gap-3 text-gray-400 text-sm">
        <span>Card {deck.currentPosition + 1} of {deck.totalCards}</span>
        <DustBadge dust={deck.dust} />
      </div>

      {/* Card */}
      <div className="relative w-full max-w-md aspect-[3/4] rounded-xl overflow-hidden bg-gray-800 shadow-2xl">
        {isImage ? (
          <img
            src={mediaUrl}
            alt={card.title}
            className="w-full h-full object-cover"
          />
        ) : (
          <video
            src={mediaUrl}
            controls
            muted
            playsInline
            className="w-full h-full object-cover"
          />
        )}
        {/* Title overlay */}
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-4">
          <p className="text-white font-medium truncate">{card.title}</p>
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-3">
        {!deck.inInventory && (
          <Button
            onClick={onTake}
            disabled={taking || deck.dust < QUEST_CARD_COST}
            title={deck.dust < QUEST_CARD_COST ? 'Not enough magic dust' : `Take card (${QUEST_CARD_COST} dust)`}
          >
            {taking ? 'Taking...' : `Take (${QUEST_CARD_COST} ✦)`}
          </Button>
        )}
        {deck.inInventory && (
          <span className="px-4 py-2 text-green-400 text-sm font-medium">In inventory</span>
        )}
        <Button variant="secondary" onClick={onNext}>
          Skip
        </Button>
      </div>
    </div>
  );
}

export default function QuestPage() {
  const [loading, setLoading] = useState(true);
  const [decks, setDecks] = useState([]);
  const [dust, setDust] = useState(0);
  const [activeDeckId, setActiveDeckId] = useState(null);
  const [activeDeck, setActiveDeck] = useState(null);
  const [taking, setTaking] = useState(false);
  const [error, setError] = useState(null);

  // Load decks
  useEffect(() => {
    fetchQuestDecks()
      .then(({ decks, dust }) => { setDecks(decks); setDust(dust); })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  // Load active deck
  useEffect(() => {
    if (!activeDeckId) { setActiveDeck(null); return; }
    fetchQuestDeck(activeDeckId)
      .then(data => {
        if (data.exhausted) {
          // Deck is done, go back to list
          setActiveDeckId(null);
          refreshDecks();
          return;
        }
        setActiveDeck(data);
        setDust(data.dust);
      })
      .catch(err => setError(err.message));
  }, [activeDeckId]);

  const refreshDecks = () => {
    fetchQuestDecks()
      .then(({ decks, dust }) => { setDecks(decks); setDust(dust); })
      .catch(err => setError(err.message));
  };

  const handleNext = async () => {
    try {
      const result = await advanceQuestDeck(activeDeckId);
      if (result.exhausted) {
        setActiveDeckId(null);
        refreshDecks();
      } else {
        setActiveDeck(result);
        setDust(result.dust);
      }
    } catch (err) {
      setError(err.message);
    }
  };

  const handleTake = async () => {
    setTaking(true);
    try {
      const result = await takeQuestCard(activeDeckId);
      if (result.exhausted) {
        setActiveDeckId(null);
        refreshDecks();
      } else {
        setActiveDeck(result);
        setDust(result.dust);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setTaking(false);
    }
  };

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
          <DustBadge dust={dust} />
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
          <button className="ml-2 underline" onClick={() => setError(null)}>dismiss</button>
        </div>
      )}

      {/* Content */}
      {activeDeck ? (
        <CardViewer
          deck={activeDeck}
          onNext={handleNext}
          onTake={handleTake}
          taking={taking}
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
