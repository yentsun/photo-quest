import { useEffect, useState } from 'react';
import { MEDIA_TYPE, words } from '@photo-quest/shared';
import Card from './Card.jsx';
import './CardOverlay.css';

export default function CardOverlay({ item, serverUrl, onClose }) {
  const [fullMedia, setFullMedia] = useState(false);

  useEffect(() => {
    const onKey = (e) => {
      if (e.target.tagName === 'INPUT') return;
      if (e.key === 'Escape') fullMedia ? setFullMedia(false) : onClose();
      if (e.key === 'f' || e.key === 'F') setFullMedia(v => !v);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [fullMedia, onClose]);

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
          className="card--large"
          header={item.title || 'Untitled'}
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
