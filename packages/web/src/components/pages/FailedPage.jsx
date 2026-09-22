import { useState, useEffect, useCallback, useContext } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { actions } from '@photo-quest/shared';
import GlobalContext from '../../globalContext.js';
import { useRefresh } from '../../contexts/RefreshContext.jsx';
import { fetchFailed, repairFailed, deleteMedia, getLastFailed } from '../../utils/api.js';
import { MediaGrid } from '../media/index.js';
import { EmptyState } from '../layout/index.js';
import { Badge, Button, Checkbox, Icon, Loader, Modal } from '../ui/index.js';

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

function groupReason(group) {
  const failedIds = new Set(group.failedIds);
  const broken = group.items.filter(item => failedIds.has(item.id));
  return broken.some(item => item.health === 'missing') ? 'missing' : 'error';
}

export default function FailedPage() {
  const navigate = useNavigate();
  const { signal, bump } = useRefresh();
  const { dispatch } = useContext(GlobalContext);

  const [searchParams, setSearchParams] = useSearchParams();
  const paramPage = Math.max(1, parseInt(searchParams.get('page'), 10) || 1);
  const page = paramPage - 1;

  /* Seed from the session cache so a revisit renders instantly instead of
     re-running (and waiting on) the server file-health sweep. */
  const cachedPage = getLastFailed(PAGE_SIZE, page * PAGE_SIZE);
  const [groups, setGroups] = useState(() => cachedPage?.groups ?? []);
  const [groupCount, setGroupCount] = useState(() => cachedPage?.groupCount ?? 0);
  const [failedCount, setFailedCount] = useState(() => cachedPage?.failedCount ?? 0);
  const [loading, setLoading] = useState(() => !cachedPage);
  const [checking, setChecking] = useState(false);
  const [fixing, setFixing] = useState(false);
  const [confirm, setConfirm] = useState(null); // { targets: group[] }
  const [selected, setSelected] = useState(() => new Set());

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

  const toggleSelect = useCallback((key) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }, []);

  const pageSelected = groups.length > 0 && groups.every(g => selected.has(g.key));
  const pageIndeterminate = groups.some(g => selected.has(g.key)) && !pageSelected;

  const toggleSelectAll = useCallback(() => {
    setSelected(prev => {
      const next = new Set(prev);
      if (pageSelected) groups.forEach(g => next.delete(g.key));
      else groups.forEach(g => next.add(g.key));
      return next;
    });
  }, [groups, pageSelected]);

  const selectedGroups = groups.filter(g => selected.has(g.key));
  const selectedBrokenCount = selectedGroups.reduce((sum, g) => sum + g.failedCount, 0);

  const load = useCallback((refresh) => {
    let cancelled = false;
    /* Only show the full-page loader when this page isn't already cached —
       otherwise keep the cached groups on screen while revalidating. */
    const cached = !refresh ? getLastFailed(PAGE_SIZE, page * PAGE_SIZE) : null;
    if (refresh) setChecking(true); else setLoading(!cached);
    fetchFailed({ limit: PAGE_SIZE, offset: page * PAGE_SIZE, refresh })
      .then(result => {
        if (cancelled) return;
        setGroups(result.groups ?? []);
        setGroupCount(result.groupCount ?? (result.groups?.length ?? 0));
        setFailedCount(result.failedCount ?? 0);
      })
      .catch(err => console.error('Failed to fetch failed media:', err))
      .finally(() => { if (!cancelled) { setLoading(false); setChecking(false); } });
    return () => { cancelled = true; };
  }, [page]);

  useEffect(() => load(false), [load, signal]);

  const totalPages = Math.max(1, Math.ceil(groupCount / PAGE_SIZE));
  const startGroup = page * PAGE_SIZE + 1;
  const endGroup = Math.min((page + 1) * PAGE_SIZE, groupCount);

  const subtitle = (() => {
    if (groupCount === 0) return 'No failed media found';
    if (loading) return 'Checking media files…';
    const range = totalPages <= 1
      ? `${groupCount.toLocaleString()} group${groupCount !== 1 ? 's' : ''}`
      : `${startGroup.toLocaleString()}–${endGroup.toLocaleString()} of ${groupCount.toLocaleString()} group${groupCount !== 1 ? 's' : ''}`;
    return `${range} · ${failedCount.toLocaleString()} broken item${failedCount !== 1 ? 's' : ''}`;
  })();

  const runFix = async ({ all = false, targets = null } = {}) => {
    const ids = targets ? [...new Set(targets.flatMap(group => group.failedIds))] : undefined;
    if (!all && (!ids || ids.length === 0)) return;
    setFixing(true);
    try {
      const result = await repairFailed(all ? { all: true } : { ids });
      if (result.repaired > 0) {
        const detail = [
          result.restored > 0 && `${result.restored} restored`,
          result.requeued > 0 && `${result.requeued} re-queued`,
        ].filter(Boolean).join(', ');
        dispatch({
          type: actions.TOAST_SHOWN,
          message: `Fixed ${result.repaired} record${result.repaired !== 1 ? 's' : ''}${detail ? ` (${detail})` : ''}`,
          toastType: 'success',
        });
      } else {
        dispatch({ type: actions.TOAST_SHOWN, message: 'Nothing could be fixed', toastType: 'error' });
      }
      setSelected(new Set());
      load(true);
      bump();
    } catch (err) {
      console.error('Failed to repair media:', err);
      dispatch({ type: actions.TOAST_SHOWN, message: 'Could not repair media', toastType: 'error' });
    } finally {
      setFixing(false);
    }
  };

  const runConfirm = async () => {
    if (!confirm) return;
    const targets = confirm.targets;
    setConfirm(null);
    const ids = [...new Set(targets.flatMap(group => group.failedIds))];
    let ok = 0;
    let fail = 0;
    for (const id of ids) {
      try {
        await deleteMedia(id);
        ok++;
      } catch (err) {
        console.error(`Failed to remove broken media ${id}:`, err);
        fail++;
      }
    }
    if (ok > 0) {
      dispatch({ type: actions.TOAST_SHOWN, message: `Removed ${ok} broken record${ok !== 1 ? 's' : ''}`, toastType: 'success' });
    }
    if (fail > 0) {
      dispatch({ type: actions.TOAST_SHOWN, message: `Could not remove ${fail} record${fail !== 1 ? 's' : ''}`, toastType: 'error' });
    }
    setSelected(new Set());
    load(true);
    bump();
  };

  const confirmMeta = (() => {
    if (!confirm) return null;
    const targets = confirm.targets;
    const isBulk = targets.length > 1;
    const n = isBulk
      ? targets.reduce((sum, group) => sum + group.failedCount, 0)
      : targets[0].failedCount;
    return {
      title: isBulk ? `Remove broken records in ${targets.length} groups` : 'Remove broken records',
      body: isBulk
        ? <>Remove <strong>{n}</strong> broken record{n !== 1 ? 's' : ''} from {targets.length} groups? Any related copies that are still intact are kept.</>
        : <>Remove <strong>{n}</strong> broken record{n !== 1 ? 's' : ''}? Related copies that are still intact are kept.</>,
      label: isBulk ? 'Remove each' : 'Remove',
      variant: 'danger',
      icon: 'trash',
    };
  })();

  if (loading && groups.length === 0) return <div className="page-loader"><Loader message="Checking media files…" /></div>;

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Failed</h1>
          <p className="page-subtitle">{subtitle}</p>
        </div>
        <div className="page-actions">
          <Button
            variant="ghost"
            size="sm"
            icon={<Icon name="wrench" className="icon-sm" />}
            onClick={() => runFix({ all: true })}
            disabled={fixing || checking || groupCount === 0}
          >
            {fixing ? 'Fixing…' : 'Fix all'}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            icon={<Icon name="refresh" className="icon-sm" />}
            onClick={() => load(true)}
            disabled={checking || fixing}
          >
            {checking ? 'Checking…' : 'Re-check'}
          </Button>
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
          <span className="duplicate-bulk-count">{selectedBrokenCount} broken record{selectedBrokenCount !== 1 ? 's' : ''}</span>
          <Button variant="ghost" size="sm" icon={<Icon name="wrench" className="icon-sm" />} onClick={() => runFix({ targets: selectedGroups })} disabled={fixing}>
            Fix each
          </Button>
          <Button variant="danger" size="sm" icon={<Icon name="trash" className="icon-sm" />} onClick={() => setConfirm({ targets: selectedGroups })}>
            Remove each
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>Clear</Button>
        </div>
      )}

      {groups.length === 0 ? (
        <EmptyState
          icon={<Icon name="warning" className="icon-2xl" />}
          title="No failed media"
          description="Media whose file is missing or unreadable, or whose processing failed, will be grouped here."
        />
      ) : (
        <div className="duplicate-groups">
          {groups.map(group => {
            const reason = groupReason(group);
            return (
              <section key={group.key} className={`duplicate-group${selected.has(group.key) ? ' duplicate-group-selected' : ''}`}>
                <header className="duplicate-group-header">
                  <Checkbox
                    checked={selected.has(group.key)}
                    onChange={() => toggleSelect(group.key)}
                    aria-label={`Select group ${group.key}`}
                  />
                  <Badge variant={reason === 'missing' ? 'error' : 'warning'}>
                    {reason === 'missing' ? 'File missing' : 'Processing failed'}
                  </Badge>
                  <span className="duplicate-group-count">
                    {group.failedCount} broken item{group.failedCount !== 1 ? 's' : ''}
                    {group.siblingCount > 0 && ` · ${group.siblingCount} related`}
                  </span>
                  {group.hash && <span className="duplicate-group-hash">{group.hash}</span>}
                  <div className="duplicate-group-actions">
                    <Button variant="ghost" size="sm" icon={<Icon name="wrench" className="icon-sm" />} onClick={() => runFix({ targets: [group] })} disabled={fixing}>
                      Fix
                    </Button>
                    <Button variant="danger" size="sm" icon={<Icon name="trash" className="icon-sm" />} onClick={() => setConfirm({ targets: [group] })}>
                      Remove broken
                    </Button>
                  </div>
                </header>
                <MediaGrid
                  items={group.items}
                  onItemClick={m => navigate(`/media/${m.id}`)}
                />
              </section>
            );
          })}
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
