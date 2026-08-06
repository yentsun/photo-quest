import { memo, useState, useRef, useEffect } from 'react';
import { MEDIA_TYPE } from '@photo-quest/shared';
import { getThumbUrl } from '../../utils/api.js';
import { Icon, Loader, ProgressBar } from '../ui/index.js';
import LikeButton from './LikeButton.jsx';
import { useJobProgress } from '../../contexts/JobProgressContext.jsx';

export default memo(function MediaCard({ media, onClick, onLike, showLikes = true }) {
  const isImage = media.type === MEDIA_TYPE.IMAGE;
  const [thumbFailed, setThumbFailed] = useState(false);
  const [thumbReady, setThumbReady] = useState(false);
  const [visible, setVisible] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setVisible(true); obs.disconnect(); } },
      { rootMargin: '200px' },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const progressSecs = useJobProgress(media.id);
  const isTranscoding = media.status === 'transcoding' || progressSecs !== null;
  const isPending = !isTranscoding && (media.status === 'pending' || media.status === 'probed');
  const showProcessingOverlay = (isTranscoding || isPending) && !thumbReady;

  const pct = isTranscoding && progressSecs !== null && media.duration > 0
    ? Math.min(99, Math.round((progressSecs / media.duration) * 100))
    : null;

  const thumbSrc = visible ? getThumbUrl(media.id, media.thumbnail_time) : undefined;

  return (
    <div className="media-card" ref={ref} onClick={() => onClick?.(media)}>
      <div className="media-card-frame">
        {thumbFailed ? (
          <div className="media-card-placeholder">
            <Icon name={isImage ? 'image' : 'video'} className="icon-xl text-mut" />
          </div>
        ) : (
          thumbSrc && (
            <img
              src={thumbSrc}
              alt={media.title}
              onLoad={() => setThumbReady(true)}
              onError={() => setThumbFailed(true)}
            />
          )
        )}

        {media.status === 'error' ? (
          <div className="media-card-overlay media-card-error">
            <Icon name="warning" className="icon-lg text-red" />
            <span className="media-card-overlay-text">Processing failed</span>
          </div>
        ) : showProcessingOverlay && (
          <div className="media-card-overlay">
            {isTranscoding && progressSecs !== null ? (
              pct !== null
                ? <ProgressBar value={pct} width={12} variant="light" />
                : <ProgressBar width={12} indeterminate showPct={false} variant="light" />
            ) : (
              <>
                <Loader size="sm" />
                <span className="media-card-overlay-text">{isTranscoding ? 'Transcoding...' : 'Processing...'}</span>
              </>
            )}
          </div>
        )}

        <span className="media-card-corner">{isImage ? 'IMG' : 'VID'}</span>

        {(() => {
          const tags = (() => {
            if (Array.isArray(media.tags)) return media.tags;
            if (typeof media.tags === 'string') { try { return JSON.parse(media.tags); } catch { return []; } }
            return [];
          })();
          return tags.length > 0 && (
            <div className="media-card-tags">
              {tags.slice(0, 3).map(tag => (
                <span key={tag} className="media-card-tag">{tag}</span>
              ))}
            </div>
          );
        })()}

        {showLikes && (
          <div className="media-card-likes">
            <LikeButton count={media.likes || 0} onLike={() => onLike?.(media)} size="sm" />
          </div>
        )}
      </div>

      <div className="media-card-meta">
        <span className="media-card-name">{media.title}</span>
      </div>
    </div>
  );
});
