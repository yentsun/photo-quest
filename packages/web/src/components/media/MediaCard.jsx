/**
 * @file Card component for displaying a single media item in a grid.
 */

import { memo } from 'react';
import { MEDIA_TYPE } from '@photo-quest/shared';
import { getMediaUrl } from '../../utils/api.js';
import { Icon } from '../ui/index.js';

/**
 * Media card with thumbnail and title overlay.
 */
export default memo(function MediaCard({
  media,
  onClick,
}) {
  const isImage = media.type === MEDIA_TYPE.IMAGE;
  const mediaUrl = getMediaUrl(media);

  return (
    <div
      className="relative aspect-square rounded-lg overflow-hidden bg-gray-800 cursor-pointer group"
      onClick={() => onClick?.(media)}
    >
      {/* Thumbnail */}
      {isImage ? (
        <img
          src={mediaUrl}
          alt={media.title}
          className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
          loading="lazy"
        />
      ) : (
        <video
          src={mediaUrl}
          preload="metadata"
          muted
          className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
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
    </div>
  );
})
