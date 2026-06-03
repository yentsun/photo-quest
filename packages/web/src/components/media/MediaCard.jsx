/**
 * @file Card component for displaying a single media item in a grid.
 */

import { memo, useState } from 'react';
import { MEDIA_TYPE } from '@photo-quest/shared';
import { getThumbUrl } from '../../utils/api.js';
import { Icon } from '../ui/index.js';
import LikeButton from './LikeButton.jsx';

/**
 * Media card with thumbnail, title overlay, and like button.
 */
export default memo(function MediaCard({
  media,
  onClick,
  onLike,
  showLikes = true,
}) {
  const isImage = media.type === MEDIA_TYPE.IMAGE;
  const [thumbFailed, setThumbFailed] = useState(false);

  return (
    <div
      className="relative aspect-square rounded-lg overflow-hidden bg-gray-800 cursor-pointer group"
      onClick={() => onClick?.(media)}
    >
      {/* Thumbnail — /thumb/:id serves EXIF-rotated image or video first frame */}
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
