import { useState, useEffect } from 'react';
import { fetchTags } from '../../utils/api.js';
import { EmptyState } from '../layout/index.js';
import { Icon, Loader } from '../ui/index.js';
import { TagCard } from '../media/index.js';

export default function TagsPage() {
  const [tags, setTags] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchTags()
      .then(data => { setTags(data); setLoading(false); })
      .catch(err => { console.error('Failed to fetch tags:', err); setLoading(false); });
  }, []);

  if (loading) return <div className="page-loader"><Loader message="tags…" /></div>;

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
        <div className="item-grid">
          {tags.map(({ tag, count, previewMediaId }) => (
            <TagCard key={tag} tag={tag} count={count} previewMediaId={previewMediaId} />
          ))}
        </div>
      )}
    </div>
  );
}
