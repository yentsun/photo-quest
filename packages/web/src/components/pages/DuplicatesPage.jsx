import { useState, useEffect, useMemo, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { MEDIA_TYPE, actions } from '@photo-quest/shared';
import GlobalContext from '../../globalContext.js';
import { useRefresh } from '../../contexts/RefreshContext.jsx';
import { fetchDuplicates, mergeDuplicates, deleteMedia, getThumbUrl } from '../../utils/api.js';
import { EmptyState } from '../layout/index.js';
import { Button, Icon, IconButton, Loader, Modal } from '../ui/index.js';

export default function DuplicatesPage() {
  const navigate = useNavigate();
  const { signal, bump } = useRefresh();
  const { dispatch } = useContext(GlobalContext);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [confirm, setConfirm] = useState(null); // { type: 'delete' | 'merge', item, group }

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
    const { type, item, group } = confirm;
    setConfirm(null);
    try {
      if (type === 'delete') {
        await deleteMedia(item.id);
        dispatch({ type: actions.TOAST_SHOWN, message: 'Duplicate deleted', toastType: 'success' });
      } else {
        const removeIds = group.items.filter(m => m.id !== item.id).map(m => m.id);
        await mergeDuplicates({ keepId: item.id, removeIds });
        dispatch({ type: actions.TOAST_SHOWN, message: 'Duplicates merged', toastType: 'success' });
      }
      bump();
    } catch (err) {
      console.error(`Failed to ${type} duplicate:`, err);
      dispatch({ type: actions.TOAST_SHOWN, message: `Could not ${type} duplicate`, toastType: 'error' });
    }
  };

  const confirmMeta = (() => {
    if (!confirm) return null;
    const { type, item, group } = confirm;
    if (type === 'delete') {
      return {
        title: 'Delete duplicate',
        body: <>Delete "<strong>{item.title}</strong>"? This removes it from the library and deletes the file from disk.</>,
        label: 'Delete',
      };
    }
    const otherCount = group.items.length - 1;
    return {
      title: 'Keep this copy',
      body: <>Keep "<strong>{item.title}</strong>" as the master and remove the other {otherCount} cop{otherCount === 1 ? 'y' : 'ies'}? Tags and likes from removed copies are merged in; their files are deleted from disk.</>,
      label: 'Keep',
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
                <span className="duplicate-group-count">{group.count} copies</span>
                <span className="duplicate-group-hash">{group.hash}</span>
              </header>
              <div className="duplicate-list">
                {group.items.map(item => {
                  const isImage = item.type === MEDIA_TYPE.IMAGE;
                  return (
                    <div key={item.id} className="duplicate-row" onClick={() => navigate(`/media/${item.id}`)}>
                      <img
                        className="duplicate-row-thumb"
                        src={getThumbUrl(item.id, item.thumbnail_time)}
                        alt={item.title}
                        loading="lazy"
                        onError={e => { e.currentTarget.style.visibility = 'hidden'; }}
                      />
                      <div className="duplicate-row-body">
                        <span className="duplicate-row-title">{item.title}</span>
                        <span className="duplicate-row-path">{item.path}</span>
                      </div>
                      <div className="duplicate-row-actions" onClick={e => e.stopPropagation()}>
                        <Button variant="ghost" size="sm" onClick={() => setConfirm({ type: 'merge', item, group })} title="Keep this copy and merge the others">
                          Keep
                        </Button>
                        <IconButton
                          icon={<Icon name="trash" className="icon-sm" />}
                          onClick={() => setConfirm({ type: 'delete', item, group })}
                          label="Delete this copy"
                        />
                      </div>
                      <span className="duplicate-row-type">{isImage ? 'IMG' : 'VID'}</span>
                    </div>
                  );
                })}
              </div>
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
