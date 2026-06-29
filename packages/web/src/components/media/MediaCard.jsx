import { memo, useState } from 'react';
import { MEDIA_TYPE } from '@photo-quest/shared';
import { getThumbUrl } from '../../utils/api.js';
import { Icon, Loader, ProgressBar } from '../ui/index.js';
import LikeButton from './LikeButton.jsx';
import { useJobProgress } from '../../contexts/JobProgressContext.jsx';

export default memo(function MediaCard({ media, onClick, onLike, showLikes = true }) {
  const isImage = media.type === MEDIA_TYPE.IMAGE;
  const [thumbFailed, setThumbFailed] = useState(false);

  const progressSecs = useJobProgress(media.id);
  const isTranscoding = media.status === 'transcoding' || progressSecs !== null;
  const isPending = !isTranscoding && (media.status === 'pending' || media.status === 'probed');

  const pct = isTranscoding && progressSecs !== null && media.duration > 0
    ? Math.min(99, Math.round((progressSecs / media.duration) * 100))
    : null;

  return (
    <div className="media-card" onClick={() => onClick?.(media)}>
      <div className="media-card-frame">
        {thumbFailed ? (
          <div className="media-card-placeholder">
            <Icon name={isImage ? 'image' : 'video'} className="icon-xl text-mut" />
          </div>
        ) : (
          <img
            src={getThumbUrl(media.id)}
            alt={media.title}
            loading="lazy"
            onError={() => setThumbFailed(true)}
          />
        )}

        {media.status === 'error' ? (
          <div className="media-card-overlay media-card-error">
            <Icon name="warning" className="icon-lg text-red" />
            <span className="media-card-overlay-text">Processing failed</span>
          </div>
        ) : (isTranscoding || isPending) && (
          <div className="media-card-overlay">
            {isTranscoding && progressSecs !== null ? (
              pct !== null
                ? <ProgressBar value={pct} width={12} variant="light" />
                : <ProgressBar width={12} indeterminate showPct={false} variant="light" />
            ) : (
              <>
                <Loader size="sm" />
                <span className="media-card-overlay-text">{isTranscoding ? 'Transcoding…' : 'Processing…'}</span>
              </>
            )}
          </div>
        )}

        <span className="media-card-corner">{isImage ? 'IMG' : 'VID'}</span>

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
})
