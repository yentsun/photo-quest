/**
 * @file Tags overview page — shows all tags with media counts.
 */

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

  if (loading) {
    return <PageLoader message="Loading tags…" />;
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Tags</h1>
        <p className="text-gray-400 text-sm">{tags.length} tag{tags.length !== 1 ? 's' : ''}</p>
      </div>

      {tags.length === 0 ? (
        <EmptyState
          icon={<Icon name="list" className="w-16 h-16" />}
          title="No tags yet"
          description="Open any photo or video and click '+ tag' to start tagging."
        />
      ) : (
        <div className="flex flex-wrap gap-3">
          {tags.map(({ tag, count }) => (
            <button
              key={tag}
              onClick={() => navigate(`/tags/${encodeURIComponent(tag)}`)}
              className="flex items-center gap-2 px-4 py-2 rounded-full bg-gray-800 hover:bg-gray-700 text-white transition-colors"
            >
              <span className="font-medium">{tag}</span>
              <span className="text-xs text-gray-400 bg-gray-700 hover:bg-gray-600 px-2 py-0.5 rounded-full">{count}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
