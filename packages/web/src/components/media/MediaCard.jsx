/**
 * @file Card component for displaying a single media item in a grid.
 */

import { MEDIA_TYPE } from '@photo-quest/shared';
import { getMediaUrl } from '../../utils/api.js';
import LikeButton from './LikeButton.jsx';

/**
 * Media card with thumbnail, title overlay, and like button.
 *
 * @param {Object} props
 * @param {Object} props.media - Media object from database
 * @param {Function} [props.onClick] - Called when card is clicked
 * @param {Function} [props.onLike] - Called when like button is clicked
 * @param {boolean} [props.showLikes=true] - Whether to show like button
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
          {isImage ? (
            <svg className="w-16 h-16 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          ) : (
            <svg className="w-16 h-16 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
          )}
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
