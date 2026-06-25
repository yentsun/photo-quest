import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useMediaActions } from '../../hooks/useMedia.js';
import { useRefresh } from '../../contexts/RefreshContext.jsx';
import { useSlideshow } from '../../contexts/SlideshowContext.jsx';
import { fetchFolders, fetchMedia, getLastFolders, getLastFolderMedia, scanMedia as scanMediaApi } from '../../utils/api.js';
import { Select } from '../ui/index.js';
import { getPageCache, setPageCache, isPageCacheValid } from '../../utils/pageCache.js';
import { idbGetFolders, idbGetMedia } from '../../services/idb.js';
import { FolderCard, MediaCard } from '../media/index.js';
import { EmptyState } from '../layout/index.js';
import { Button, Icon, Input, Loader, Modal } from '../ui/index.js';

const PAGE_SIZE = 30;
const FETCH_LIMIT = 10000;

function byName(a, b) {
  return a.title.localeCompare(b.title, undefined, { numeric: true, sensitivity: 'base' });
}

function applySort(items, sort) {
  const result = sort === 'filename' ? items.slice().sort(byName) : items.slice();
  const coverIdx = result.findIndex(m => /cover/i.test(m.title));
  if (coverIdx > 0) result.unshift(result.splice(coverIdx, 1)[0]);
  return result;
}

function getPageNumbers(current, total) {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i);
  const set = new Set([0, total - 1, current]);
  for (let i = Math.max(0, current - 2); i <= Math.min(total - 1, current + 2); i++) set.add(i);
  const sorted = [...set].sort((a, b) => a - b);
  const result = [];
  for (let i = 0; i < sorted.length; i++) {
    if (i > 0 && sorted[i] - sorted[i - 1] > 1) result.push('…');
    result.push(sorted[i]);
  }
  return result;
}

function byFolderName(a, b) {
  const nameA = a.path.split(/[/\\]/).pop() || '';
  const nameB = b.path.split(/[/\\]/).pop() || '';
  return nameA.localeCompare(nameB, undefined, { numeric: true, sensitivity: 'base' });
}

export default function FolderPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { likeMedia } = useMediaActions();
  const { signal, bump } = useRefresh();
  const slideshow = useSlideshow();
  const pendingShuffle = useRef(false);
  const [refreshing, setRefreshing] = useState(false);
  const [sort, setSort] = useState('filename');
  const sortRef = useRef('filename');
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const searchRef = useRef('');
  const [page, setPage] = useState(0);

  const folderId = Number(id);
  const CACHE_KEY = `folder:${folderId}:${sort}`;
  const _pc = isPageCacheValid(CACHE_KEY, signal) ? getPageCache(CACHE_KEY) : null;

  useEffect(() => { slideshow.stop(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setSearchQuery('');
    setDebouncedSearch('');
    searchRef.current = '';
    setSort('filename');
    sortRef.current = 'filename';
    setPage(0);
  }, [folderId]);

  useEffect(() => {
    const timer = setTimeout(() => { setDebouncedSearch(searchQuery); searchRef.current = searchQuery; }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  useEffect(() => { setPage(0); }, [debouncedSearch]);

  const _sc0Folders = getLastFolders();
  const _sc0Folder  = _sc0Folders?.find(f => f.id === folderId) ?? null;
  const _sc0Media   = _sc0Folder ? getLastFolderMedia(_sc0Folder.path) : null;

  const [folders, setFolders] = useState(_pc?.data.folders ?? _sc0Folders ?? []);
  const [directMedia, setDirectMedia] = useState(_pc?.data.directMedia ?? _sc0Media?.items ?? []);
  const [loading, setLoading] = useState(!_pc && !_sc0Folders);
  const [loadingMessage, setLoadingMessage] = useState('Fetching folder list…');
  const [contentReady, setContentReady] = useState(!!_pc || !!_sc0Media);
  const contentReadyRef = useRef(!!_pc || !!_sc0Media);
  const contentReadyForIdRef = useRef(folderId);
  const serverLoadedRef = useRef(false);
  const folderRef = useRef(_pc?.data.folders?.find(f => f.id === folderId) ?? _sc0Folder);

  useEffect(() => {
    let cancelled = false;
    serverLoadedRef.current = false;
    setLoadingMessage('Fetching folder list…');
    const isSearching = Boolean(debouncedSearch);

    if (!isSearching && isPageCacheValid(CACHE_KEY, signal)) {
      const { folders: pf, directMedia: pm } = getPageCache(CACHE_KEY).data;
      setFolders(pf);
      setDirectMedia(pm);
      folderRef.current = pf.find(f => f.id === folderId) ?? folderRef.current;
      contentReadyRef.current = true;
      contentReadyForIdRef.current = folderId;
      setContentReady(true);
      setLoading(false);
      return;
    }

    const scFolders = getLastFolders();
    const scFolder  = scFolders?.find(f => f.id === folderId);
    const scMedia   = !isSearching && scFolder ? getLastFolderMedia(scFolder.path) : null;
    if (!scFolders) setLoading(true);
    if (scMedia) {
      setDirectMedia(applySort(scMedia.items, sort));
      if (scFolder) folderRef.current = scFolder;
      contentReadyRef.current = true;
      contentReadyForIdRef.current = folderId;
      setContentReady(true);
      setLoading(false);
    } else if (!contentReadyRef.current || contentReadyForIdRef.current !== folderId) {
      setDirectMedia([]);
      setContentReady(false);
      contentReadyRef.current = false;
    }
    if (!isSearching) {
      idbGetFolders().then(async (cachedFolders) => {
        if (cancelled) return;
        const found = cachedFolders.find(f => f.id === folderId);
        if (!found) return;
        const { items } = await idbGetMedia({ folder: found.path, limit: FETCH_LIMIT, sort: 'filename' });
        if (cancelled || items.length === 0 || scMedia || serverLoadedRef.current) return;
        setFolders(cachedFolders);
        folderRef.current = found;
        setDirectMedia(applySort(items, sort));
        setLoading(false);
        contentReadyRef.current = true;
        contentReadyForIdRef.current = folderId;
        setContentReady(true);
      }).catch(() => {});
    }
    const load = async () => {
      try {
        const allFolders = await fetchFolders();
        if (cancelled) return;
        setFolders(allFolders);
        const found = allFolders.find(f => f.id === folderId);
        if (found) {
          folderRef.current = found;
          const folderName = found.path.split(/[/\\]/).filter(Boolean).pop() || 'folder';
          setLoadingMessage(`'${folderName}'…`);
          const fetchOpts = { folder: found.path, limit: FETCH_LIMIT, offset: 0, ...(sort && { sort }) };
          if (debouncedSearch) fetchOpts.search = debouncedSearch;
          const { items } = await fetchMedia(fetchOpts);
          if (!cancelled) {
            serverLoadedRef.current = true;
            const sorted = applySort(items, sort);
            setDirectMedia(sorted);
            if (!isSearching) {
              setPageCache(CACHE_KEY, { folders: allFolders, directMedia: sorted }, signal);
            }
          }
        }
      } catch (err) { console.error('Failed to load folder data:', err); }
      finally { if (!cancelled) { setLoading(false); contentReadyRef.current = true; contentReadyForIdRef.current = folderId; setContentReady(true); } }
    };
    load();
    return () => { cancelled = true; };
  }, [folderId, signal, debouncedSearch, sort]); // eslint-disable-line react-hooks/exhaustive-deps

  const folder = useMemo(() => folders.find(f => f.id === folderId), [folders, folderId]);
  const subfolders = useMemo(() => folders.filter(f => f.parentId === folderId).sort(byFolderName), [folders, folderId]);

  const allItems = useMemo(() => {
    if (debouncedSearch) return directMedia.map(m => ({ kind: 'media', item: m }));
    return [
      ...subfolders.map(f => ({ kind: 'folder', item: f })),
      ...directMedia.map(m => ({ kind: 'media', item: m })),
    ];
  }, [subfolders, directMedia, debouncedSearch]);

  const totalPages = Math.ceil(allItems.length / PAGE_SIZE);
  const displayItems = allItems.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const breadcrumbs = useMemo(() => {
    const crumbs = [];
    let current = folders.find(f => f.id === folderId);
    while (current) {
      crumbs.unshift(current);
      current = current.parentId ? folders.find(f => f.id === current.parentId) : null;
    }
    return crumbs;
  }, [folders, folderId]);

  const handleRefresh = async () => {
    const f = folderRef.current;
    if (!f || refreshing) return;
    setRefreshing(true);
    try { await scanMediaApi(f.path); bump(); }
    catch (err) { console.error('Failed to refresh folder:', err); }
    finally { setRefreshing(false); }
  };

  const handleShuffle = async () => {
    const f = folderRef.current;
    if (!f) return;
    try {
      const { items, total } = await fetchMedia({ folder: f.path, subtree: true, random: true });
      if (items.length === 0) return;
      pendingShuffle.current = true;
      slideshow.start(items, { order: 'sequential', total });
    } catch (err) { console.error('Failed to fetch subtree media for shuffle:', err); }
  };

  useEffect(() => {
    if (pendingShuffle.current && slideshow.active && slideshow.current) {
      pendingShuffle.current = false;
      navigate(`/media/${slideshow.current.id}`);
    }
  }, [slideshow.active, slideshow.current, navigate]);

  if (loading) return <div className="page-loader"><Loader message={loadingMessage} /></div>;

  const folderName = folder ? folder.path.split(/[/\\]/).filter(Boolean).pop() || 'Folder' : 'Folder';
  const subtreeTotal = folder?.subtreeMediaCount || 0;

  const itemLabel = (() => {
    const total = allItems.length;
    if (total === 0) return null;
    if (totalPages <= 1) return `${total.toLocaleString()} item${total !== 1 ? 's' : ''}`;
    const start = page * PAGE_SIZE + 1;
    const end = Math.min((page + 1) * PAGE_SIZE, total);
    return `${start.toLocaleString()}–${end.toLocaleString()} of ${total.toLocaleString()} items`;
  })();

  return (
    <div className="page">
      {breadcrumbs.length > 0 && (
        <nav className="breadcrumb-nav">
          <Button variant="text" onClick={() => navigate('/dashboard')}>Library</Button>
          {breadcrumbs.map((crumb, i) => {
            const name = crumb.path.split(/[/\\]/).filter(Boolean).pop();
            const isLast = i === breadcrumbs.length - 1;
            return (
              <span key={crumb.id} style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                <span className="breadcrumb-sep">/</span>
                {isLast ? (
                  <span className="breadcrumb-current">{name}</span>
                ) : (
                  <Button variant="text" onClick={() => navigate(`/folder/${crumb.id}`)}>{name}</Button>
                )}
              </span>
            );
          })}
        </nav>
      )}

      <div className="page-header">
        <div>
          <h1 className="page-title">{folderName}</h1>
          <p className="page-subtitle">
            {itemLabel}
            {contentReady && !itemLabel && '0 items'}
          </p>
        </div>
        <div className="page-actions">
          {subtreeTotal > 0 && (
            <Button variant="ghost" size="sm" onClick={handleShuffle} icon={<Icon name="shuffle" className="icon-sm" />}>
              <span className="sm-show">Shuffle</span>
            </Button>
          )}
          {folder && (
            <Button variant="ghost" size="sm" onClick={handleRefresh} disabled={refreshing} title="Rescan folder for new files" icon={<Icon name="refresh" className="icon-sm" />}>
              <span className="sm-show">Refresh</span>
            </Button>
          )}
          <Select
            value={sort}
            onChange={e => { const v = e.target.value; setSort(v); sortRef.current = v; setPage(0); }}
            options={[
              { value: 'filename', label: 'Name' },
              { value: '', label: 'Date' },
            ]}
            title="Sort order"
          />
          <Button
            variant={debouncedSearch ? 'primary' : 'ghost'}
            size="sm"
            onClick={() => setSearchOpen(true)}
            title="Search by title"
            icon={<Icon name="search" className="icon-sm" />}
          >
            <span className="sm-show">Search</span>
          </Button>
        </div>
      </div>

      {!contentReady ? (
        <div className="page-loader"><Loader /></div>
      ) : displayItems.length > 0 ? (
        <>
          <div className="item-grid">
            {displayItems.map(({ kind, item }) =>
              kind === 'folder'
                ? <FolderCard key={`f-${item.id}`} folder={item} />
                : <MediaCard key={`m-${item.id}`} media={item} onClick={m => navigate(`/media/${m.id}`)} onLike={likeMedia} />
            )}
          </div>
          {totalPages > 1 && (
            <div className="pagination-row">
              <Button variant="ghost" size="sm" disabled={page === 0} onClick={() => setPage(p => p - 1)} icon={<Icon name="prev" className="icon-sm" />} />
              {getPageNumbers(page, totalPages).map((p, i) =>
                p === '…'
                  ? <span key={`ellipsis-${i}`} className="pagination-ellipsis">…</span>
                  : <Button key={p} variant={p === page ? 'primary' : 'ghost'} size="sm" onClick={() => setPage(p)}>{p + 1}</Button>
              )}
              <Button variant="ghost" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)} icon={<Icon name="next" className="icon-sm" />} />
            </div>
          )}
        </>
      ) : debouncedSearch ? (
        <EmptyState
          icon={<Icon name="search" className="icon-2xl" />}
          title="No results"
          description={`No media matching "${debouncedSearch}".`}
        />
      ) : (
        <EmptyState
          icon={<Icon name="folder" className="icon-2xl" />}
          title="Folder not found"
          description="This folder doesn't exist or contains no media."
        />
      )}

      <Modal open={searchOpen} onClose={() => setSearchOpen(false)} title="Search">
        <div className="search-wrap">
          <Icon name="search" className="search-icon icon-sm" />
          <Input
            type="search"
            placeholder="Search by title…"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            autoFocus
          />
        </div>
        {debouncedSearch && (
          <Button variant="text" onClick={() => { setSearchQuery(''); setDebouncedSearch(''); searchRef.current = ''; }}>
            Clear search
          </Button>
        )}
      </Modal>
    </div>
  );
}
