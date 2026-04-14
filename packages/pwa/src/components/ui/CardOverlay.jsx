import { useEffect, useState } from 'react';
import { MEDIA_TYPE, words } from '@photo-quest/shared';
import Card from './Card.jsx';
import Input from './Input.jsx';
import { useLocalStore } from '../../hooks/useLocalStore.js';
import { STORES } from '../../db/localDb.js';
import { freeInfuseCard, renameCard } from '../../db/actions.js';
import './CardOverlay.css';

const PASSIVE_TICK_MS = 5_000;
const PASSIVE_CAP_MS  = 120_000;

export default function CardOverlay({ item: initialItem, serverUrl, onClose }) {
  const [fullMedia, setFullMedia] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draftTitle, setDraftTitle] = useState('');
  const items = useLocalStore(STORES.CARDS, null);
  const item = items?.find(it => it.inventory_id === initialItem?.inventory_id) || initialItem;

  useEffect(() => { setEditing(false); }, [item?.inventory_id]);

  const saveTitle = () => {
    const trimmed = draftTitle.trim();
    if (trimmed && trimmed !== item.title) renameCard(item.inventory_id, trimmed);
    setEditing(false);
  };

  useEffect(() => {
    const onKey = (e) => {
      if (e.target.tagName === 'INPUT') return;
      if (e.key === 'Escape') fullMedia ? setFullMedia(false) : onClose();
      if (e.key === 'f' || e.key === 'F') setFullMedia(v => !v);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [fullMedia, onClose]);

  /* LAW 4.11: 1 infusion / 5s in card view, 2 / 5s in full view, capped at 2 min. */
  useEffect(() => {
    if (!item?.inventory_id) return;
    const start = Date.now();
    const amount = fullMedia ? 2 : 1;
    const t = setInterval(() => {
      if (Date.now() - start >= PASSIVE_CAP_MS) { clearInterval(t); return; }
      freeInfuseCard(item.inventory_id, amount);
    }, PASSIVE_TICK_MS);
    return () => clearInterval(t);
  }, [item?.inventory_id, fullMedia]);

  if (!item) return null;
  const isImage = item.type === MEDIA_TYPE.IMAGE;
  const mediaUrl = isImage ? `${serverUrl}/image/${item.id}` : `${serverUrl}/stream/${item.id}`;
  const infusion = item.infusion || 0;

  if (fullMedia) {
    return (
      <div className="overlay overlay--full" onClick={() => setFullMedia(false)}>
        {isImage
          ? <img src={mediaUrl} alt={item.title} className="overlay__fullmedia" />
          : <video src={mediaUrl} controls autoPlay muted playsInline
                   className="overlay__fullmedia" onClick={(e) => e.stopPropagation()} />}
      </div>
    );
  }

  return (
    <div className="overlay" onClick={onClose}>
      <div className="overlay__card" onClick={(e) => e.stopPropagation()}>
        <Card
          size="large"
          header={editing ? (
            <Input
              value={draftTitle}
              autoFocus
              onChange={(e) => setDraftTitle(e.target.value)}
              onBlur={saveTitle}
              onKeyDown={(e) => {
                if (e.key === 'Enter')  saveTitle();
                if (e.key === 'Escape') setEditing(false);
              }}
            />
          ) : (
            <span
              onClick={() => { setDraftTitle(item.title || ''); setEditing(true); }}
              style={{ cursor: 'text' }}
            >
              {item.title || 'Untitled'}
            </span>
          )}
          headerRight={<span style={{ color: '#d8b4fe' }}>{words?.dustSymbol || 'Đ'} {infusion}</span>}
          art={
            <div className="overlay__art">
              {isImage
                ? <img src={mediaUrl} alt={item.title} />
                : <video src={mediaUrl} autoPlay loop muted playsInline
                         onClick={(e) => e.stopPropagation()} />}
              <button className="overlay__fs-btn" onClick={() => setFullMedia(true)} title="Fullscreen (F)">F</button>
            </div>
          }
        />
      </div>
    </div>
  );
}
