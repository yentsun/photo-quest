import { memo } from 'react';
import { useNavigate } from 'react-router-dom';
import { getThumbUrl } from '../../utils/api.js';
import { Icon, IconButton } from '../ui/index.js';

export default memo(function FolderCard({ folder, onRemove }) {
  const navigate = useNavigate();
  const folderName = folder.path.split(/[/\\]/).filter(Boolean).pop() || 'Folder';
  const thumbnailUrl = folder.previewMediaId ? getThumbUrl(folder.previewMediaId) : null;
  const imageCount = folder.subtreeImageCount ?? folder.imageCount ?? 0;
  const videoCount = folder.subtreeVideoCount ?? folder.videoCount ?? 0;

  return (
    <div className="folder-card" onClick={() => navigate(`/folder/${folder.id}`)}>
      <div className="folder-card-frame">
        {thumbnailUrl ? (
          <img src={thumbnailUrl} alt={folderName} loading="lazy" />
        ) : (
          <div className="folder-card-empty">
            <Icon name="folder" className="icon-2xl text-mut" />
          </div>
        )}

        {onRemove && (
          <div className="folder-card-remove">
            <IconButton
              icon={<Icon name="close" className="icon-sm" />}
              onClick={(e) => { e.stopPropagation(); onRemove(); }}
              label="Remove folder"
              size="sm"
              className="icon-btn-overlay"
            />
          </div>
        )}
      </div>

      <div className="folder-card-meta">
        <p className="folder-card-name">{folderName}</p>
        {(imageCount > 0 || videoCount > 0) && (
          <p className="folder-card-counts">
            {imageCount > 0 && `${imageCount} image${imageCount !== 1 ? 's' : ''}`}
            {imageCount > 0 && videoCount > 0 && ', '}
            {videoCount > 0 && `${videoCount} video${videoCount !== 1 ? 's' : ''}`}
          </p>
        )}
      </div>
    </div>
  );
})
