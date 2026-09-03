import { useState, useEffect, useMemo, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { actions } from '@photo-quest/shared';
import GlobalContext from '../../globalContext.js';
import { useRefresh } from '../../contexts/RefreshContext.jsx';
import { fetchDuplicates, mergeDuplicates, deleteDuplicates } from '../../utils/api.js';
import { MediaGrid } from '../media/index.js';
import { EmptyState } from '../layout/index.js';
import { Button, Icon, Loader, Modal } from '../ui/index.js';

export default function DuplicatesPage() {
  const navigate = useNavigate();
  const { signal, bump } = useRefresh();
  const { dispatch } = useContext(GlobalContext);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [confirm, setConfirm] = useState(null); // { type: 'merge' | 'delete', group }

  useEffect(() => {
    let cancelled = false;
    fetchDuplicates()
      .then(result => { if (!cancelled) { setData(result); setLoading(false); } })
      .catch(err => { console.error('Failed to fetch duplicates:', err); if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [signal]);

  const groups = data?.groups ?? [];
  const totalCopies = useMemo(() => groups.reduce((acc, g) => acc + (g.count - 1), 0), [groups]);

  const runConfirm = async () => {
    if (!confirm) return;
    const { type, group } = confirm;
    setConfirm(null);
    try {
      if (type === 'merge') {
        await mergeDuplicates({ hash: group.hash });
        dispatch({ type: actions.TOAST_SHOWN, message: 'Duplicates merged', toastType: 'success' });
      } else {
        await deleteDuplicates({ hash: group.hash });
        dispatch({ type: actions.TOAST_SHOWN, message: 'Duplicates deleted', toastType: 'success' });
      }
      bump();
    } catch (err) {
      console.error(`Failed to ${type} duplicates:`, err);
      dispatch({ type: actions.TOAST_SHOWN, message: `Could not ${type} duplicates`, toastType: 'error' });
    }
  };

  const confirmMeta = (() => {
    if (!confirm) return null;
    const { type, group } = confirm;
    const n = group.count;
    if (type === 'delete') {
      return {
        title: 'Delete all duplicates',
        body: <>Delete all <strong>{n}</strong> cop{n === 1 ? 'y' : 'ies'}? Every record and file in this group will be removed from disk.</>,
        label: 'Delete all',
      };
    }
    return {
      title: 'Merge all duplicates',
      body: <>Merge all <strong>{n}</strong> cop{n === 1 ? 'y' : 'ies'} into one? The most mature copy (earliest added, or most liked) is kept; likes and tags are combined, and the other files are deleted from disk.</>,
      label: 'Merge all',
    };
  })();

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
                <span className="duplicate-group-count">{group.count} cop{group.count === 1 ? 'y' : 'ies'}</span>
                <span className="duplicate-group-hash">{group.hash}</span>
                <div className="duplicate-group-actions">
                  <Button variant="ghost" size="sm" onClick={() => setConfirm({ type: 'merge', group })}>
                    Merge all
                  </Button>
                  <Button variant="danger" size="sm" icon={<Icon name="trash" className="icon-sm" />} onClick={() => setConfirm({ type: 'delete', group })}>
                    Delete all
                  </Button>
                </div>
              </header>
              <MediaGrid
                items={group.items}
                onItemClick={m => navigate(`/media/${m.id}`)}
              />
            </section>
          ))}
        </div>
      )}

      <Modal open={!!confirm} onClose={() => setConfirm(null)} title={confirmMeta?.title}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Icon name="warning" className="icon-md text-mut" />
          <p className="text-mut">{confirmMeta?.body}</p>
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <Button variant="ghost" size="sm" onClick={() => setConfirm(null)}>Cancel</Button>
          <Button variant="danger" size="sm" icon={<Icon name="trash" className="icon-sm" />} onClick={runConfirm}>
            {confirmMeta?.label}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
