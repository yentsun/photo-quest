import { useState, useEffect, useCallback, useContext } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { actions } from '@photo-quest/shared';
import GlobalContext from '../../globalContext.js';
import { useRefresh } from '../../contexts/RefreshContext.jsx';
import { fetchDuplicates, mergeDuplicates, deleteDuplicates } from '../../utils/api.js';
import { MediaGrid } from '../media/index.js';
import { EmptyState } from '../layout/index.js';
import { Button, Checkbox, Icon, Loader, Modal } from '../ui/index.js';

const PAGE_SIZE = 25;

function getPageNumbers(current, total) {
  if (total <= 5) return Array.from({ length: total }, (_, i) => i);
  const set = new Set([0, total - 1, current]);
  for (let i = Math.max(0, current - 1); i <= Math.min(total - 1, current + 1); i++) set.add(i);
  const sorted = [...set].sort((a, b) => a - b);
  const result = [];
  for (let i = 0; i < sorted.length; i++) {
    if (i > 0 && sorted[i] - sorted[i - 1] > 1) result.push('...');
    result.push(sorted[i]);
  }
  return result;
}

export default function DuplicatesPage() {
  const navigate = useNavigate();
  const { signal, bump } = useRefresh();
  const { dispatch } = useContext(GlobalContext);
  const [groups, setGroups] = useState([]);
  const [groupCount, setGroupCount] = useState(0);
  const [copyCount, setCopyCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [confirm, setConfirm] = useState(null); // { type: 'merge' | 'delete', targets: group[] }
  const [selected, setSelected] = useState(() => new Set());

  const [searchParams, setSearchParams] = useSearchParams();
  const paramPage = Math.max(1, parseInt(searchParams.get('page'), 10) || 1);
  const page = paramPage - 1;

  const goToPage = useCallback((p) => {
    if (p === 0) { setSearchParams({}, { replace: true }); return; }
    setSearchParams({ page: String(p + 1) });
  }, [setSearchParams]);

  useEffect(() => {
    document.querySelector('.page')?.scrollTo({ top: 0, behavior: 'instant' });
  }, [page]);

  /* Selection is scoped to the visible page (only loaded groups carry ids).
     Clear it when the page changes so we never act on stale off-page rows. */
  useEffect(() => { setSelected(new Set()); }, [page]);

  const toggleSelect = useCallback((hash) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(hash)) next.delete(hash); else next.add(hash);
      return next;
    });
  }, []);

  const pageSelected = groups.length > 0 && groups.every(g => selected.has(g.hash));
  const pageIndeterminate = groups.some(g => selected.has(g.hash)) && !pageSelected;

  const toggleSelectAll = useCallback(() => {
    setSelected(prev => {
      const next = new Set(prev);
      if (pageSelected) groups.forEach(g => next.delete(g.hash));
      else groups.forEach(g => next.add(g.hash));
      return next;
    });
  }, [groups, pageSelected]);

  const selectedGroups = groups.filter(g => selected.has(g.hash));

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchDuplicates({ limit: PAGE_SIZE, offset: page * PAGE_SIZE })
      .then(result => {
        if (cancelled) return;
        setGroups(result.groups ?? []);
        setGroupCount(result.groupCount ?? (result.groups?.length ?? 0));
        setCopyCount(result.copyCount ?? 0);
      })
      .catch(err => console.error('Failed to fetch duplicates:', err))
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [page, signal]);

  const totalPages = Math.max(1, Math.ceil(groupCount / PAGE_SIZE));
  const startGroup = page * PAGE_SIZE + 1;
  const endGroup = Math.min((page + 1) * PAGE_SIZE, groupCount);

  const subtitle = (() => {
    if (groupCount === 0) return 'No duplicates found';
    if (loading) return 'Finding duplicates…';
    const range = totalPages <= 1
      ? `${groupCount.toLocaleString()} group${groupCount !== 1 ? 's' : ''}`
      : `${startGroup.toLocaleString()}–${endGroup.toLocaleString()} of ${groupCount.toLocaleString()} group${groupCount !== 1 ? 's' : ''}`;
    return `${range} · ${copyCount.toLocaleString()} duplicate cop${copyCount === 1 ? 'y' : 'ies'}`;
  })();

  const runConfirm = async () => {
    if (!confirm) return;
    const { type, targets } = confirm;
    setConfirm(null);
    let ok = 0;
    let fail = 0;
    for (const group of targets) {
      try {
        if (type === 'merge') await mergeDuplicates({ ids: group.ids });
        else await deleteDuplicates({ ids: group.ids });
        ok++;
      } catch (err) {
        console.error(`Failed to ${type} duplicate group ${group.hash}:`, err);
        fail++;
      }
    }
    if (ok > 0) {
      dispatch({ type: actions.TOAST_SHOWN, message: type === 'merge' ? `Merged ${ok} group${ok !== 1 ? 's' : ''}` : `Deleted ${ok} group${ok !== 1 ? 's' : ''}`, toastType: 'success' });
    }
    if (fail > 0) {
      dispatch({ type: actions.TOAST_SHOWN, message: `Could not ${type} ${fail} group${fail !== 1 ? 's' : ''}`, toastType: 'error' });
    }
    setSelected(new Set());
    bump();
  };

  const confirmMeta = (() => {
    if (!confirm) return null;
    const { type, targets } = confirm;
    const isBulk = targets.length > 1;
    const n = isBulk ? targets.length : targets[0].count;
    if (type === 'delete') {
      return {
        title: isBulk ? `Delete duplicates in ${targets.length} groups` : 'Delete all duplicates',
        body: isBulk
          ? <>Delete all duplicates in <strong>{targets.length}</strong> selected groups? Every record and file in these groups will be removed from disk.</>
          : <>Delete all <strong>{n}</strong> cop{n === 1 ? 'y' : 'ies'}? Every record and file in this group will be removed from disk.</>,
        label: isBulk ? 'Delete each' : 'Delete all',
        variant: 'danger',
        icon: 'trash',
      };
    }
    return {
      title: isBulk ? `Merge duplicates in ${targets.length} groups` : 'Merge all duplicates',
      body: isBulk
        ? <>Merge all duplicates in <strong>{targets.length}</strong> selected groups into one each? The most mature copy (earliest added, or most liked) of each group is kept; likes and tags are combined, and the other files are deleted from disk.</>
        : <>Merge all <strong>{n}</strong> cop{n === 1 ? 'y' : 'ies'} into one? The most mature copy (earliest added, or most liked) is kept; likes and tags are combined, and the other files are deleted from disk.</>,
      label: isBulk ? 'Merge each' : 'Merge all',
      variant: 'primary',
      icon: 'copy',
    };
  })();

  if (loading && groups.length === 0) return <div className="page-loader"><Loader message="Finding duplicates…" /></div>;

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Duplicates</h1>
          <p className="page-subtitle">{subtitle}</p>
        </div>
      </div>

      {selected.size > 0 && (
        <div className="duplicate-bulk-bar">
          <Checkbox
            checked={pageSelected}
            indeterminate={pageIndeterminate}
            onChange={toggleSelectAll}
            label={`Select all (${groups.length})`}
          />
          <span className="duplicate-bulk-count">{selected.size} selected</span>
          <Button variant="primary" size="sm" icon={<Icon name="copy" className="icon-sm" />} onClick={() => setConfirm({ type: 'merge', targets: selectedGroups })}>
            Merge each
          </Button>
          <Button variant="danger" size="sm" icon={<Icon name="trash" className="icon-sm" />} onClick={() => setConfirm({ type: 'delete', targets: selectedGroups })}>
            Delete each
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>Clear</Button>
        </div>
      )}

      {groups.length === 0 ? (
        <EmptyState
          icon={<Icon name="copy" className="icon-2xl" />}
          title="No duplicates"
          description="Photos and videos pointing to the same file (content hash) will be grouped here."
        />
      ) : (
        <div className="duplicate-groups">
          {groups.map(group => (
            <section key={group.hash} className={`duplicate-group${selected.has(group.hash) ? ' duplicate-group-selected' : ''}`}>
              <header className="duplicate-group-header">
                <Checkbox
                  checked={selected.has(group.hash)}
                  onChange={() => toggleSelect(group.hash)}
                  aria-label={`Select group ${group.hash}`}
                />
                <span className="duplicate-group-count">{group.count} cop{group.count === 1 ? 'y' : 'ies'}</span>
                <span className="duplicate-group-hash">{group.hash}</span>
                <div className="duplicate-group-actions">
                  <Button variant="ghost" size="sm" onClick={() => setConfirm({ type: 'merge', targets: [group] })}>
                    Merge all
                  </Button>
                  <Button variant="danger" size="sm" icon={<Icon name="trash" className="icon-sm" />} onClick={() => setConfirm({ type: 'delete', targets: [group] })}>
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
          {totalPages > 1 && (
            <div className="pagination-row">
              <Button variant="ghost" size="sm" disabled={page === 0} onClick={() => goToPage(page - 1)} icon={<Icon name="prev" className="icon-sm" />} />
              {getPageNumbers(page, totalPages).map((p, i) =>
                p === '...'
                  ? <span key={`ellipsis-${i}`} className="pagination-ellipsis">...</span>
                  : <Button key={p} variant={p === page ? 'primary' : 'ghost'} size="sm" onClick={() => goToPage(p)}>{p + 1}</Button>
              )}
              <Button variant="ghost" size="sm" disabled={page >= totalPages - 1} onClick={() => goToPage(page + 1)} icon={<Icon name="next" className="icon-sm" />} />
            </div>
          )}
        </div>
      )}

      <Modal open={!!confirm} onClose={() => setConfirm(null)} title={confirmMeta?.title}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Icon name="warning" className="icon-md text-mut" />
          <p className="text-mut">{confirmMeta?.body}</p>
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <Button variant="ghost" size="sm" onClick={() => setConfirm(null)}>Cancel</Button>
          <Button
            variant={confirmMeta?.variant}
            size="sm"
            icon={confirmMeta?.icon ? <Icon name={confirmMeta.icon} className="icon-sm" /> : undefined}
            onClick={runConfirm}
          >
            {confirmMeta?.label}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
