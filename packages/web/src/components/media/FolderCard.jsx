/**
 * @file Card component for displaying a folder with preview thumbnail and item count.
 */

import { memo } from 'react';
import { getImageUrl } from '../../utils/api.js';
import { Card, Icon } from '../ui/index.js';

export default memo(function FolderCard({ folder, onClick }) {
  const folderName = folder.path.split(/[/\\]/).filter(Boolean).pop() || 'Folder';
  const thumbnailUrl = folder.previewMediaId ? getImageUrl(folder.previewMediaId) : null;
  const imageCount = folder.subtreeImageCount ?? folder.imageCount ?? 0;
  const videoCount = folder.subtreeVideoCount ?? folder.videoCount ?? 0;

  const counts = [
    imageCount > 0 && `${imageCount} img`,
    videoCount > 0 && `${videoCount} vid`,
  ].filter(Boolean).join(' · ');

  return (
    <Card
      header={folderName}
      art={
        thumbnailUrl ? (
          <img src={thumbnailUrl} alt={folderName} className="w-full h-full object-cover" loading="lazy" />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gray-700">
            <Icon name="folder" className="w-16 h-16 text-gray-500" />
          </div>
        )
      }
      footer={<span className="text-gray-400 truncate">{counts}</span>}
      onClick={() => onClick?.(folder)}
    />
  );
})
