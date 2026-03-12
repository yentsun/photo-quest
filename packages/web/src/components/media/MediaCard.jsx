/**
 * @file Card component for displaying a single media item in a grid.
 */

import { MEDIA_TYPE } from '@photo-quest/shared';
import { getMediaUrl } from '../../utils/api.js';
import { Icon } from '../ui/index.js';
import LikeButton from './LikeButton.jsx';

/**
 * Media card with thumbnail, title overlay, and like button.
 */
export default function MediaCard({
  media,
  onClick,
  onLike,
  showLikes = true,
}) {
  const isImage = media.type === MEDIA_TYPE.IMAGE;
  const thumbnailUrl = isImage ? getMediaUrl(media) : null;

  return (
    <div
      className="relative aspect-square rounded-lg overflow-hidden bg-gray-800 cursor-pointer group"
      onClick={() => onClick?.(media)}
    >
      {/* Thumbnail */}
      {thumbnailUrl ? (
        <img
          src={thumbnailUrl}
          alt={media.title}
          className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
          loading="lazy"
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center bg-gray-700">
          <Icon name={isImage ? 'image' : 'video'} className="w-16 h-16 text-gray-500" />
        </div>
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
}
