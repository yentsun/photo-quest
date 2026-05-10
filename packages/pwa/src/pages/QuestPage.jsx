import { useCallback, useEffect, useRef, useState } from 'react';
import { MEDIA_TYPE, words } from '@photo-quest/shared';
import Button from '../components/ui/Button.jsx';
import Card from '../components/ui/Card.jsx';
import Modal from '../components/ui/Modal.jsx';
import Spinner from '../components/ui/Spinner.jsx';
import { useLocalStore } from '../hooks/useLocalStore.js';
import { useMediaSrc } from '../hooks/useMediaSrc.js';
import { STORES } from '../db/localDb.js';
import { advanceQuest, takeQuest, destroyQuest, freeInfuseQuest, consumeExhaustedQuestDeck } from '../db/actions.js';
import './QuestPage.css';

const PASSIVE_TICK_MS = 5_000;
const PASSIVE_CAP_MS  = 120_000;

/* Hidden preload so the upcoming card's blob is in IDB / object URL ready
 * before the user advances. Hook lives in its own component so its
 * lifecycle is tied to the next-card identity, not the page render. */
function NextCardPreload({ server, card }) {
  const src = useMediaSrc(server?.url, card);
  if (!src) return null;
  return <img src={src} alt="" aria-hidden crossOrigin="anonymous" style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden' }} />;
}

function CardViewer({ state, dust, server, busy, onTake, onSkip, onDestroy }) {
  const card = state.currentCard;
  const [mediaLoaded, setMediaLoaded] = useState(false);
  const [mediaError,  setMediaError]  = useState(false);
  useEffect(() => { setMediaLoaded(false); setMediaError(false); }, [card?.id]);

  useEffect(() => {
    if (!card) return;
    const start = Date.now();
    const t = setInterval(() => {
      if (Date.now() - start >= PASSIVE_CAP_MS) { clearInterval(t); return; }
      freeInfuseQuest(state.id, card.id, 1);
    }, PASSIVE_TICK_MS);
    return () => clearInterval(t);
  }, [card?.id, state.id]);

  const mediaUrl = useMediaSrc(server?.url, card);

  if (!card) return null;

  const isImage = card.type === MEDIA_TYPE.IMAGE;

  /* Derive cost from the live infusion (including passive ticks), not
   * from state.takeCost which froze at the last server response. */
  const infusion = card.infusion || 0;
  const isFreeTake = infusion === 0;
  const takeCost   = isFreeTake ? 0 : infusion * 2;
  const canTake    = !isFreeTake || !state.freeTakeUsed;

  const takeLabel = takeCost === 0 ? 'Take (free)' : `Take (${takeCost} ${words.dustSymbol})`;
  const takeDisabledReason =
    !canTake            ? 'Free take already used'
    : takeCost > dust   ? `Not enough ${words.dustSymbol}`
    : null;

  return (
    <div className="quest-page__viewer">
      <Card
        size="large"
        header={card.title || card.filename || 'Untitled'}
        headerRight={<span style={{ color: '#d8b4fe' }}>{words.dustSymbol} {card.infusion || 0}</span>}
        art={
          <div style={{ position: 'relative', width: '100%', height: '100%', background: '#000' }}>
            {!mediaLoaded && !mediaError && <Spinner />}
            {mediaError && (
              <div style={{
                position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
                color: '#9ca3af', textAlign: 'center', padding: '1rem',
              }}>
                <div style={{ fontSize: '2rem' }}>⚠️</div>
                <div>Image not available offline</div>
                <div style={{ fontSize: '0.85rem', color: '#6b7280' }}>
                  Use Skip to move on, or come back online to load it.
                </div>
              </div>
            )}
            {isImage ? (
              <img
                key={card.id} src={mediaUrl} alt={card.title} crossOrigin="anonymous"
                onLoad={() => { setMediaLoaded(true); setMediaError(false); }}
                onError={() => setMediaError(true)}
                style={{ width: '100%', height: '100%', objectFit: 'cover',
                         opacity: mediaLoaded ? 1 : 0, transition: 'opacity .2s' }}
              />
            ) : (
              <video
                key={card.id} src={mediaUrl} controls muted playsInline crossOrigin="anonymous"
                onLoadedData={() => { setMediaLoaded(true); setMediaError(false); }}
                onError={() => setMediaError(true)}
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
  const [confirmDestroy, setConfirmDestroy] = useState(null);
  const lockRef = useRef(false);

  const states     = useLocalStore(STORES.QUEST_STATE, `qs-${questDeckId}`);
  const playerRows = useLocalStore(STORES.PLAYER_STATS, null);
  const state      = states?.find(s => s.id === questDeckId);
  const dust       = playerRows?.[0]?.dust ?? 0;

  const runLocked = useCallback(async (fn) => {
    if (lockRef.current) return;
    lockRef.current = true; setBusy(true);
    try { await fn(); }
    catch (err) { setError(err.message); }
    finally { lockRef.current = false; setBusy(false); }
  }, []);

  const handleSkip    = useCallback(() => runLocked(() => advanceQuest(questDeckId)), [questDeckId, runLocked]);
  const handleTake    = useCallback(() => runLocked(() => takeQuest(questDeckId)),    [questDeckId, runLocked]);

  const handleDestroy = useCallback(() => {
    const infusion = state?.currentCard?.infusion || 0;
    setConfirmDestroy({ reward: Math.max(2, infusion * 2) });
  }, [state?.currentCard?.infusion]);

  const confirmDestroyNow = useCallback(async () => {
    setConfirmDestroy(null);
    await runLocked(() => destroyQuest(questDeckId));
  }, [questDeckId, runLocked]);

  /* Auto-return to inventory once the local quest state reports the
   * deck exhausted. advancedState/destroyedState set this when the
   * position runs past the local cards array.
   * Wipe the inventory row first so the user doesn't see a stale quest
   * deck card on bounce-back (sync-all would clear it, but not instantly). */
  useEffect(() => {
    if (!state?.exhausted) return;
    (async () => {
      try { await consumeExhaustedQuestDeck(questDeckId); }
      finally { onBack?.(); }
    })();
  }, [state?.exhausted, questDeckId, onBack]);

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
          dust={dust}
          server={server}
          busy={busy}
          onTake={handleTake}
          onSkip={handleSkip}
          onDestroy={handleDestroy}
        />
      ) : (
        <p className="quest-page__placeholder">Deck exhausted.</p>
      )}

      {state.nextCard?.type === MEDIA_TYPE.IMAGE && (
        <NextCardPreload server={server} card={state.nextCard} />
      )}

      <Modal open={!!confirmDestroy} title="Destroy this card?" onClose={() => setConfirmDestroy(null)}>
        <p style={{ color: '#d1d5db', marginBottom: '0.75rem' }}>
          The file will be deleted from disk. You'll receive{' '}
          <strong style={{ color: '#fde68a' }}>
            +{confirmDestroy?.reward} {words.dustSymbol}
          </strong>.
        </p>
        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
          <Button variant="secondary" onClick={() => setConfirmDestroy(null)}>Cancel</Button>
          <Button onClick={confirmDestroyNow} style={{ color: '#f87171' }}>Destroy</Button>
        </div>
      </Modal>
    </div>
  );
}
