/**
 * @file Media card — image/video thumbnail with infusion badge.
 *
 * Used for media items in the player's inventory.
 */

import { memo } from 'react';
import { MEDIA_TYPE, words } from '@photo-quest/shared';
import Card from './Card.jsx';
import { getImageUrl, getMediaUrl } from '../../utils/api.js';

export default memo(function MediaCard({ item, onClick, actions }) {
  const isImage = item.type === MEDIA_TYPE.IMAGE;
  const thumbUrl = isImage ? getImageUrl(item.id) : getMediaUrl(item);
  const infusion = item.infusion || 0;

  return (
    <Card
      header={
        <>
          <span className="text-gray-400 text-[10px] uppercase tracking-wide">{isImage ? 'Image' : 'Video'}</span>
          <span className="text-purple-300 text-[10px] font-medium">{words.dustSymbol} {infusion}</span>
        </>
      }
      art={
        isImage ? (
          <img src={thumbUrl} alt={item.title} className="w-full h-full object-cover" loading="lazy" draggable={false} />
        ) : (
          <video src={thumbUrl} preload="metadata" muted className="w-full h-full object-cover" />
        )
      }
      footer={
        <div className="flex items-center justify-between gap-1">
          <p className="text-white text-xs font-medium truncate flex-1">{item.title}</p>
          {actions}
        </div>
      }
      onClick={onClick}
    />
  );
});
