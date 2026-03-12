/**
 * @file Card component for displaying a folder with preview thumbnail and item count.
 */

import { useNavigate } from 'react-router-dom';
import { MEDIA_TYPE } from '@photo-quest/shared';
import { getImageUrl } from '../../utils/api.js';
import { Icon, IconButton } from '../ui/index.js';

/**
 * Folder card showing a preview image, folder name, and item count.
 */
export default function FolderCard({ folderPath, items, onRemove }) {
  const navigate = useNavigate();
  const folderName = folderPath.split(/[/\\]/).filter(Boolean).pop() || 'Folder';

  const previewItem = items.find(m => m.type === MEDIA_TYPE.IMAGE);
  const thumbnailUrl = previewItem ? getImageUrl(previewItem.id) : null;

  const imageCount = items.filter(m => m.type === MEDIA_TYPE.IMAGE).length;
  const videoCount = items.filter(m => m.type === MEDIA_TYPE.VIDEO).length;

  return (
    <div
      className="relative aspect-square rounded-lg overflow-hidden bg-gray-800 cursor-pointer group"
      onClick={() => navigate(`/folder/${encodeURIComponent(folderPath)}`)}
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

      {/* Gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />

      {/* Remove button */}
      {onRemove && (
        <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
          <IconButton
            icon={<Icon name="close" className="w-4 h-4" />}
            onClick={(e) => { e.stopPropagation(); onRemove(); }}
            label="Remove folder"
            size="sm"
            className="bg-black/50 text-gray-400 hover:text-red-400"
          />
        </div>
      )}

      {/* Folder name and counts */}
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
}
