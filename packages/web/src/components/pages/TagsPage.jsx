import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchTags } from '../../utils/api.js';
import { EmptyState } from '../layout/index.js';
import { Icon, PageLoader } from '../ui/index.js';

export default function TagsPage() {
  const navigate = useNavigate();
  const [tags, setTags] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchTags()
      .then(data => { setTags(data); setLoading(false); })
      .catch(err => { console.error('Failed to fetch tags:', err); setLoading(false); });
  }, []);

  if (loading) return <PageLoader message="tags…" />;

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Tags</h1>
          <p className="page-subtitle">{tags.length} tag{tags.length !== 1 ? 's' : ''}</p>
        </div>
      </div>

      {tags.length === 0 ? (
        <EmptyState
          icon={<Icon name="list" className="icon-2xl" />}
          title="No tags yet"
          description="Open any photo or video and click '+ tag' to start tagging."
        />
      ) : (
        <div className="tag-list">
          {tags.map(({ tag, count }) => (
            <button
              key={tag}
              onClick={() => navigate(`/tags/${encodeURIComponent(tag)}`)}
              className="tag-list-item"
            >
              <span>{tag}</span>
              <span className="tag-count">{count}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
