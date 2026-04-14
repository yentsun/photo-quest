import { useCallback, useEffect, useRef, useState } from 'react';
import { MEDIA_TYPE, words } from '@photo-quest/shared';
import Button from '../components/ui/Button.jsx';
import Card from '../components/ui/Card.jsx';
import Spinner from '../components/ui/Spinner.jsx';
import { useLocalStore } from '../hooks/useLocalStore.js';
import { STORES } from '../db/localDb.js';
import { advanceQuest, takeQuest, destroyQuest, freeInfuseQuest } from '../db/actions.js';
import './QuestPage.css';

const PASSIVE_TICK_MS = 5_000;
const PASSIVE_CAP_MS  = 120_000;

function CardViewer({ state, server, busy, onTake, onSkip, onDestroy }) {
  const card = state.currentCard;
  const [mediaLoaded, setMediaLoaded] = useState(false);
  useEffect(() => { setMediaLoaded(false); }, [card?.id]);

  useEffect(() => {
    if (!card) return;
    const start = Date.now();
    const t = setInterval(() => {
      if (Date.now() - start >= PASSIVE_CAP_MS) { clearInterval(t); return; }
      freeInfuseQuest(state.id, card.id, 1);
    }, PASSIVE_TICK_MS);
    return () => clearInterval(t);
  }, [card?.id, state.id]);

  if (!card) return null;

  const isImage = card.type === MEDIA_TYPE.IMAGE;
  const mediaUrl = isImage ? `${server.url}/image/${card.id}` : `${server.url}/stream/${card.id}`;
  const takeLabel = state.takeCost === 0 ? 'Take (free)' : `Take (${state.takeCost} ${words.dustSymbol})`;
  const takeDisabledReason =
    !state.canTake                ? 'Free take already used'
    : state.takeCost > state.dust ? `Not enough ${words.dustSymbol}`
    : null;

  return (
    <div className="quest-page__viewer">
      <Card
        header={card.title || card.filename || 'Untitled'}
        headerRight={<span style={{ color: '#d8b4fe' }}>{words.dustSymbol} {card.infusion || 0}</span>}
        art={
          <div style={{ position: 'relative', width: '100%', height: '100%', background: '#000' }}>
            {!mediaLoaded && <Spinner />}
            {isImage ? (
              <img
                src={mediaUrl} alt={card.title}
                onLoad={() => setMediaLoaded(true)}
                style={{ width: '100%', height: '100%', objectFit: 'cover',
                         opacity: mediaLoaded ? 1 : 0, transition: 'opacity .2s' }}
              />
            ) : (
              <video
                src={mediaUrl} controls muted playsInline
                onLoadedData={() => setMediaLoaded(true)}
                style={{ width: '100%', height: '100%', objectFit: 'cover',
                         opacity: mediaLoaded ? 1 : 0, transition: 'opacity .2s' }}
              />
            )}
          </div>
        }
        footer={<span>{state.currentPosition + 1} / {state.totalCards}</span>}
      />

      <div className="quest-page__actions">
        <Button onClick={onTake} disabled={busy || !!takeDisabledReason} title={takeDisabledReason || takeLabel}>
          {takeLabel}
        </Button>
        <Button variant="secondary" onClick={onSkip} disabled={busy}>Skip</Button>
        <Button variant="secondary" onClick={onDestroy} disabled={busy} style={{ color: '#f87171' }}>
          Destroy
        </Button>
      </div>
    </div>
  );
}

export default function QuestPage({ questDeckId, server, onBack }) {
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const lockRef = useRef(false);

  const states = useLocalStore(STORES.QUEST_STATE, `qs-${questDeckId}`);
  const state  = states?.find(s => s.id === questDeckId);

  const runLocked = useCallback(async (fn) => {
    if (lockRef.current) return;
    lockRef.current = true; setBusy(true);
    try { await fn(); }
    catch (err) { setError(err.message); }
    finally { lockRef.current = false; setBusy(false); }
  }, []);

  const handleSkip    = useCallback(() => runLocked(() => advanceQuest(questDeckId)), [questDeckId, runLocked]);
  const handleTake    = useCallback(() => runLocked(() => takeQuest(questDeckId)),    [questDeckId, runLocked]);
  const handleDestroy = useCallback(() => runLocked(() => destroyQuest(questDeckId)), [questDeckId, runLocked]);

  useEffect(() => {
    if (state?.exhausted) onBack?.();
  }, [state?.exhausted, onBack]);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'ArrowRight') handleSkip(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [handleSkip]);

  if (!state) return <Spinner label="Loading quest…" />;

  return (
    <div className="quest-page">
      <header className="quest-page__header">
        <h1 className="quest-page__title">🃏 Quest #{state.deckIndex + 1}</h1>
        <Button variant="ghost" onClick={onBack}>Back</Button>
      </header>

      {error && (
        <div className="quest-page__error">
          {error}
          <Button variant="ghost" size="sm" onClick={() => setError(null)}>dismiss</Button>
        </div>
      )}

      {state.currentCard ? (
        <CardViewer
          state={state}
          server={server}
          busy={busy}
          onTake={handleTake}
          onSkip={handleSkip}
          onDestroy={handleDestroy}
        />
      ) : (
        <p className="quest-page__placeholder">Deck exhausted.</p>
      )}
    </div>
  );
}
