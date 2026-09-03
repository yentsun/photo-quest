import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useRefresh } from '../../contexts/RefreshContext.jsx';
import { fetchDuplicates } from '../../utils/api.js';
import { MediaGrid } from '../media/index.js';
import { EmptyState } from '../layout/index.js';
import { Icon, Loader } from '../ui/index.js';

export default function DuplicatesPage() {
  const navigate = useNavigate();
  const { signal } = useRefresh();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetchDuplicates()
      .then(result => { if (!cancelled) { setData(result); setLoading(false); } })
      .catch(err => { console.error('Failed to fetch duplicates:', err); if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [signal]); // eslint-disable-line react-hooks/exhaustive-deps

  const groups = data?.groups ?? [];
  const totalCopies = useMemo(() => groups.reduce((acc, g) => acc + (g.count - 1), 0), [groups]);

  if (loading && !data) return <div className="page-loader"><Loader message="Finding duplicates…" /></div>;

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Duplicates</h1>
          <p className="page-subtitle">
            {groups.length === 0
              ? 'No duplicates found'
              : `${groups.length.toLocaleString()} group${groups.length !== 1 ? 's' : ''} · ${totalCopies.toLocaleString()} duplicate cop${totalCopies === 1 ? 'y' : 'ies'}`}
          </p>
        </div>
      </div>

      {groups.length === 0 ? (
        <EmptyState
          icon={<Icon name="copy" className="icon-2xl" />}
          title="No duplicates"
          description="Photos and videos pointing to the same file (content hash) will be grouped here."
        />
      ) : (
        <div className="duplicate-groups">
          {groups.map(group => (
            <section key={group.hash} className="duplicate-group">
              <header className="duplicate-group-header">
                <span className="duplicate-group-count">{group.count} copies</span>
                <span className="duplicate-group-hash">{group.hash}</span>
              </header>
              <MediaGrid
                items={group.items}
                onItemClick={m => navigate(`/media/${m.id}`)}
              />
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
