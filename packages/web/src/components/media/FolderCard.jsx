/**
 * @file Card component for displaying a folder with preview thumbnail and item count.
 */

import { memo } from 'react';
import { getImageUrl } from '../../utils/api.js';
import { Icon } from '../ui/index.js';

export default memo(function FolderCard({ folder, onClick }) {
  const folderName = folder.path.split(/[/\\]/).filter(Boolean).pop() || 'Folder';
  const thumbnailUrl = folder.previewMediaId ? getImageUrl(folder.previewMediaId) : null;
  const imageCount = folder.subtreeImageCount ?? folder.imageCount ?? 0;
  const videoCount = folder.subtreeVideoCount ?? folder.videoCount ?? 0;

  return (
    <div
      className="relative aspect-square rounded-lg overflow-hidden bg-gray-800 cursor-pointer group"
      onClick={() => onClick?.(folder)}
    >
      {thumbnailUrl ? (
        <img
          src={thumbnailUrl}
          alt={folderName}
          className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
          loading="lazy"
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center bg-gray-700">
          <Icon name="folder" className="w-16 h-16 text-gray-500" />
        </div>
      )}

      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />

      <div className="absolute bottom-0 left-0 right-0 p-3">
        <p className="text-white font-medium truncate">{folderName}</p>
        <p className="text-gray-300 text-xs mt-0.5">
          {imageCount > 0 && `${imageCount} image${imageCount !== 1 ? 's' : ''}`}
          {imageCount > 0 && videoCount > 0 && ', '}
          {videoCount > 0 && `${videoCount} video${videoCount !== 1 ? 's' : ''}`}
        </p>
      </div>
    </div>
  );
})
