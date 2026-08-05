import { memo, useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getThumbUrl } from '../../utils/api.js';
import { Icon } from '../ui/index.js';

export default memo(function TagCard({ tag, count, previewMediaId, previewThumbnailTime }) {
  const navigate = useNavigate();
  const [visible, setVisible] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setVisible(true); obs.disconnect(); } },
      { rootMargin: '200px' },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const thumbnailUrl = visible && previewMediaId ? getThumbUrl(previewMediaId, previewThumbnailTime) : null;

  return (
    <div className="folder-card" ref={ref} onClick={() => navigate(`/tags/${encodeURIComponent(tag)}`)}>
      <div className="folder-card-frame">
        {thumbnailUrl ? (
          <img src={thumbnailUrl} alt={tag} />
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
