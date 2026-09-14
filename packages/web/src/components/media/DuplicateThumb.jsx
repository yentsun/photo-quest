import { memo, useState } from 'react';
import { MEDIA_TYPE } from '@photo-quest/shared';
import { getThumbUrl } from '../../utils/api.js';
import { Icon } from '../ui/index.js';

/**
 * Small fixed-size preview of a media item, used to visually verify duplicate
 * copies before a destructive merge/delete.
 *
 * Falls back to a type icon when the thumbnail can't be produced (missing
 * file, unreadable, unsupported). Works for both images and videos — the
 * `/thumb/:id` endpoint renders a frame for videos.
 */
export default memo(function DuplicateThumb({ media, size = 56 }) {
  const [failed, setFailed] = useState(false);
  const isImage = media.type === MEDIA_TYPE.IMAGE;

  if (failed) {
    return (
      <span
        className="duplicate-thumb duplicate-thumb-fallback"
        style={{ width: size, height: size }}
      >
        <Icon name={isImage ? 'image' : 'video'} className="icon-md text-mut" />
      </span>
    );
  }

  return (
    <img
      className="duplicate-thumb"
      style={{ width: size, height: size }}
      src={getThumbUrl(media.id, media.thumbnail_time)}
      alt={media.title}
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
});
