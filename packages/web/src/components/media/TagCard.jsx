import { memo } from 'react';
import { useNavigate } from 'react-router-dom';
import { getThumbUrl } from '../../utils/api.js';
import { Icon } from '../ui/index.js';

export default memo(function TagCard({ tag, count, previewMediaId }) {
  const navigate = useNavigate();
  const thumbnailUrl = previewMediaId ? getThumbUrl(previewMediaId) : null;

  return (
    <div className="folder-card" onClick={() => navigate(`/tags/${encodeURIComponent(tag)}`)}>
      <div className="folder-card-frame">
        {thumbnailUrl ? (
          <img src={thumbnailUrl} alt={tag} loading="lazy" />
        ) : (
          <div className="folder-card-empty">
            <Icon name="list" className="icon-2xl text-mut" />
          </div>
        )}
      </div>
      <div className="folder-card-meta">
        <p className="folder-card-name">{tag}</p>
        <p className="folder-card-counts">{count} item{count !== 1 ? 's' : ''}</p>
      </div>
    </div>
  );
});
