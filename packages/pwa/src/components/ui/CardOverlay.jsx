import { useEffect, useState } from 'react';
import { MEDIA_TYPE } from '@photo-quest/shared';
import Card from './Card.jsx';
import InfusionBadge from './InfusionBadge.jsx';
import { mediaUrl as buildMediaUrl } from '../../utils/mediaUrl.js';
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
  const mediaUrl = buildMediaUrl(serverUrl, item);

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
          headerRight={<InfusionBadge amount={item.infusion || 0} />}
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
