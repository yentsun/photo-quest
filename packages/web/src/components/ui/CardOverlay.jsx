/**
 * @file Full-screen card detail overlay with passive infusion.
 */

import { useState, useEffect, useRef } from 'react';
import { MEDIA_TYPE, words } from '@photo-quest/shared';
import { freeInfuseMedia, getMediaUrl } from '../../utils/api.js';
import Button from './Button.jsx';
import Card from './Card.jsx';

export default function CardOverlay({ item, onClose, actions }) {
  const [fullMedia, setFullMedia] = useState(false);
  const [infusion, setInfusion] = useState(item?.infusion || 0);
  const fullMediaRef = useRef(false);

  useEffect(() => { setInfusion(item?.infusion || 0); }, [item?.id]);
  useEffect(() => { fullMediaRef.current = fullMedia; }, [fullMedia]);

  useEffect(() => {
    if (!item) return;
    const startTime = Date.now();
    const interval = setInterval(() => {
      if (Date.now() - startTime >= 120000) { clearInterval(interval); return; }
      const amount = fullMediaRef.current ? 2 : 1;
      freeInfuseMedia(item.id, amount)
        .then(({ media }) => setInfusion(media.infusion))
        .catch(() => {});
    }, 5000);
    return () => clearInterval(interval);
  }, [item?.id]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') { fullMediaRef.current ? setFullMedia(false) : onClose(); }
      if (e.key === 'f' || e.key === 'F') setFullMedia(prev => !prev);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (!item) return null;
  const isImage = item.type === MEDIA_TYPE.IMAGE;
  const mediaUrl = getMediaUrl(item);

  if (fullMedia) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black cursor-pointer" onClick={() => setFullMedia(false)}>
        {isImage ? (
          <img src={mediaUrl} alt={item.title} className="max-w-full max-h-full object-contain" />
        ) : (
          <video src={mediaUrl} controls autoPlay muted playsInline className="max-w-full max-h-full object-contain" onClick={(e) => e.stopPropagation()} />
        )}
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 cursor-pointer" onClick={onClose}>
      <div className="relative" onClick={(e) => e.stopPropagation()}>
        <Card
          size="large"
          className="w-[min(28rem,45vw)]"
          header={item.title}
          headerRight={<span className="text-purple-300 text-xs font-medium">{words.dustSymbol} {infusion}</span>}
          art={
            <div className="group/art w-full h-full bg-black">
              {isImage ? (
                <img src={mediaUrl} alt={item.title} className="w-full h-full object-cover" />
              ) : (
                <video src={mediaUrl} controls muted playsInline className="w-full h-full object-cover" onClick={(e) => e.stopPropagation()} />
              )}
              <Button variant="ghost" size="sm" onClick={() => setFullMedia(true)} className="absolute bottom-2 right-2 opacity-0 group-hover/art:opacity-100 transition-opacity bg-black/60 hover:bg-black/80 text-white">
                F
              </Button>
            </div>
          }
          footer={null}
        />
        {actions && (
          <div className="absolute left-full top-1/2 -translate-y-1/2 ml-3 flex flex-col gap-2">
            {actions}
          </div>
        )}
      </div>
    </div>
  );
}
