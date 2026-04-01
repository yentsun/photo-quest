/**
 * @file Large card overlay for a folder with action controls.
 */

import { useEffect } from 'react';
import { getImageUrl, scanMedia } from '../../utils/api.js';
import { showToast } from '../ToasterMessage.jsx';
import { Card, IconButton, Icon } from '../ui/index.js';

export default function FolderOverlay({ folder, onClose, onRemove, onRefresh }) {
  useEffect(() => {
    if (!folder) return;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [folder, onClose]);

  if (!folder) return null;

  const folderName = folder.path.split(/[/\\]/).filter(Boolean).pop() || 'Folder';
  const thumbnailUrl = folder.previewMediaId ? getImageUrl(folder.previewMediaId) : null;
  const imageCount = folder.subtreeImageCount ?? folder.imageCount ?? 0;
  const videoCount = folder.subtreeVideoCount ?? folder.videoCount ?? 0;

  const handleRefresh = () => {
    scanMedia(folder.path)
      .then(() => { showToast('Scanning for new media...'); if (onRefresh) onRefresh(); })
      .catch(() => showToast('Scan failed', 'error'));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 cursor-pointer" onClick={onClose}>
      <div className="relative" onClick={(e) => e.stopPropagation()}>
        <Card
          size="large"
          className="w-[min(28rem,45vw)]"
          header={<span className="text-gray-400 text-xs uppercase tracking-wide">Folder</span>}
          art={
            thumbnailUrl ? (
              <img src={thumbnailUrl} alt={folderName} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full bg-gray-800 flex items-center justify-center">
                <Icon name="folder" className="w-20 h-20 text-gray-600" />
              </div>
            )
          }
          footer={
            <>
              <p className="text-white font-semibold text-sm truncate">{folderName}</p>
              <p className="text-gray-500 text-xs truncate mt-0.5" title={folder.path}>{folder.path}</p>
              <p className="text-gray-400 text-xs mt-0.5">
                {imageCount > 0 && `${imageCount} image${imageCount !== 1 ? 's' : ''}`}
                {imageCount > 0 && videoCount > 0 && ' · '}
                {videoCount > 0 && `${videoCount} video${videoCount !== 1 ? 's' : ''}`}
              </p>
            </>
          }
        />
        <div className="absolute left-full top-1/2 -translate-y-1/2 ml-3 flex flex-col gap-2">
          <IconButton
            icon={<Icon name="refresh" className="w-5 h-5" />}
            label="Refresh folder"
            onClick={handleRefresh}
            className="bg-blue-900/80 hover:bg-blue-700 text-blue-200 hover:text-white rounded-full p-2"
          />
          {onRemove && (
            <IconButton
              icon={<Icon name="trash" className="w-5 h-5" />}
              label="Remove folder"
              onClick={() => { onRemove(); onClose(); }}
              className="bg-red-900/80 hover:bg-red-700 text-red-200 hover:text-white rounded-full p-2"
            />
          )}
        </div>
      </div>
    </div>
  );
}
