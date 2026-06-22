import { memo, useState } from 'react';
import { MEDIA_TYPE } from '@photo-quest/shared';
import { getThumbUrl } from '../../utils/api.js';
import { Icon } from '../ui/index.js';
import LikeButton from './LikeButton.jsx';
import { useJobProgress } from '../../contexts/JobProgressContext.jsx';

export default memo(function MediaCard({
  media,
  onClick,
  onLike,
  showLikes = true,
}) {
  const isImage = media.type === MEDIA_TYPE.IMAGE;
  const [thumbFailed, setThumbFailed] = useState(false);

  const progressSecs = useJobProgress(media.id);
  const isTranscoding = media.status === 'transcoding' || progressSecs !== null;
  const isPending = !isTranscoding && (media.status === 'pending' || media.status === 'probed');

  const pct = isTranscoding && progressSecs !== null && media.duration > 0
    ? Math.min(99, Math.round((progressSecs / media.duration) * 100))
    : null;

  return (
    <div
      className="relative aspect-square rounded-lg overflow-hidden bg-gray-800 cursor-pointer group"
      onClick={() => onClick?.(media)}
    >
      {/* Thumbnail */}
      {thumbFailed ? (
        <div className="w-full h-full flex items-center justify-center">
          <Icon name={isImage ? 'image' : 'video'} className="w-12 h-12 text-gray-600" />
        </div>
      ) : (
        <img
          src={getThumbUrl(media.id)}
          alt={media.title}
          className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
          loading="lazy"
          onError={() => setThumbFailed(true)}
        />
      )}

      {/* Gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />

      {/* Title */}
      <div className="absolute bottom-0 left-0 right-0 p-3">
        <p className="text-white text-sm font-medium truncate opacity-0 group-hover:opacity-100 transition-opacity">
          {media.title}
        </p>
      </div>

      {/* Transcoding / pending overlay */}
      {(isTranscoding || isPending) && (
        <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center gap-2 px-4">
          {isTranscoding && pct !== null ? (
            <>
              <div className="w-full bg-gray-700 rounded-full h-1.5">
                <div
                  className="bg-blue-500 h-1.5 rounded-full transition-all duration-500"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <span className="text-white text-xs">{pct}%</span>
            </>
          ) : (
            <>
              <div className="w-5 h-5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
              <span className="text-white text-xs">{isTranscoding ? 'Transcoding…' : 'Processing…'}</span>
            </>
          )}
        </div>
      )}

      {/* Media type badge */}
      <div className="absolute top-2 left-2">
        <span className="px-2 py-1 text-xs font-medium rounded bg-black/50 text-white">
          {isImage ? 'IMG' : 'VID'}
        </span>
      </div>

      {/* Like button */}
      {showLikes && (
        <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
          <LikeButton
            count={media.likes || 0}
            onLike={() => onLike?.(media)}
            size="sm"
          />
        </div>
      )}
    </div>
  );
})
