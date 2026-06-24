import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useMediaActions } from '../../hooks/useMedia.js';
import { useRefresh } from '../../contexts/RefreshContext.jsx';
import { useSlideshow } from '../../contexts/SlideshowContext.jsx';
import { fetchFolders, fetchMedia, getLastFolders, getLastFolderMedia, scanMedia as scanMediaApi } from '../../utils/api.js';
import { Select } from '../ui/index.js';
import { getPageCache, setPageCache, isPageCacheValid } from '../../utils/pageCache.js';
import { idbGetFolders, idbGetMedia } from '../../services/idb.js';
import { FolderCard } from '../media/index.js';
import { MediaGrid } from '../media/index.js';
import { EmptyState } from '../layout/index.js';
import { Button, Icon, Input, Modal, PageLoader, Spinner } from '../ui/index.js';

const PAGE_SIZE = 200;

function byName(a, b) {
  return a.title.localeCompare(b.title, undefined, { numeric: true, sensitivity: 'base' });
}

function applySort(items, sort) {
  const result = sort === 'filename' ? items.slice().sort(byName) : items.slice();
  const coverIdx = result.findIndex(m => /cover/i.test(m.title));
  if (coverIdx > 0) result.unshift(result.splice(coverIdx, 1)[0]);
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
  }, [folderId]);

  useEffect(() => {
    const timer = setTimeout(() => { setDebouncedSearch(searchQuery); searchRef.current = searchQuery; }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const _sc0Folders = getLastFolders();
  const _sc0Folder  = _sc0Folders?.find(f => f.id === folderId) ?? null;
  const _sc0Media   = _sc0Folder ? getLastFolderMedia(_sc0Folder.path) : null;

  const [folders, setFolders] = useState(_pc?.data.folders ?? _sc0Folders ?? []);
  const [directMedia, setDirectMedia] = useState(_pc?.data.directMedia ?? _sc0Media?.items ?? []);
  const [mediaTotal, setMediaTotal] = useState(_pc?.data.mediaTotal ?? _sc0Media?.total ?? 0);
  const [loading, setLoading] = useState(!_pc && !_sc0Folders);
  const [loadingMessage, setLoadingMessage] = useState('Fetching folder list…');
  const [loadingMore, setLoadingMore] = useState(false);
  const [contentReady, setContentReady] = useState(!!_pc || !!_sc0Media);
  const loadingMoreRef = useRef(false);
  const serverLoadedRef = useRef(false);
  const offsetRef = useRef(_pc?.data.offset ?? _sc0Media?.items.length ?? 0);
  const mediaTotalRef = useRef(_pc?.data.mediaTotal ?? _sc0Media?.total ?? 0);
  const folderRef = useRef(_pc?.data.folders?.find(f => f.id === folderId) ?? _sc0Folder);

  useEffect(() => {
    let cancelled = false;
    serverLoadedRef.current = false;
    setLoadingMessage('Fetching folder list…');
    const isSearching = Boolean(debouncedSearch);

    if (!isSearching && isPageCacheValid(CACHE_KEY, signal)) {
      const { folders: pf, directMedia: pm, mediaTotal: pt, offset: po } = getPageCache(CACHE_KEY).data;
      setFolders(pf);
      setDirectMedia(pm);
      setMediaTotal(pt);
      offsetRef.current = po;
      mediaTotalRef.current = pt;
      folderRef.current = pf.find(f => f.id === folderId) ?? folderRef.current;
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
      setMediaTotal(scMedia.total);
      offsetRef.current = scMedia.items.length;
      mediaTotalRef.current = scMedia.total;
      if (scFolder) folderRef.current = scFolder;
      setContentReady(true);
      setLoading(false);
    } else {
      setDirectMedia([]);
      setMediaTotal(0);
      setContentReady(false);
      offsetRef.current = 0;
      mediaTotalRef.current = 0;
    }
    if (!isSearching) {
      idbGetFolders().then(async (cachedFolders) => {
        if (cancelled) return;
        const found = cachedFolders.find(f => f.id === folderId);
        if (!found) return;
        const { items, total } = await idbGetMedia({ folder: found.path, limit: PAGE_SIZE, sort: 'filename' });
        if (cancelled || items.length === 0 || scMedia || serverLoadedRef.current) return;
        setFolders(cachedFolders);
        folderRef.current = found;
        mediaTotalRef.current = total;
        offsetRef.current = items.length;
        setDirectMedia(applySort(items, sort));
        setMediaTotal(total);
        setLoading(false);
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
          setLoadingMessage(`Loading '${folderName}'…`);
          const fetchOpts = { folder: found.path, limit: PAGE_SIZE, offset: 0, ...(sort && { sort }) };
          if (debouncedSearch) fetchOpts.search = debouncedSearch;
          const { items, total } = await fetchMedia(fetchOpts);
          if (!cancelled) {
            serverLoadedRef.current = true;
            const sorted = applySort(items, sort);
            offsetRef.current = items.length;
            mediaTotalRef.current = total;
            setDirectMedia(sorted);
            setMediaTotal(total);
            if (!isSearching) {
              setPageCache(CACHE_KEY, { folders: allFolders, directMedia: sorted, mediaTotal: total, offset: items.length }, signal);
            }
          }
        }
      } catch (err) { console.error('Failed to load folder data:', err); }
      finally { if (!cancelled) { setLoading(false); setContentReady(true); } }
    };
    load();
    return () => { cancelled = true; };
  }, [folderId, signal, debouncedSearch, sort]); // eslint-disable-line react-hooks/exhaustive-deps

  const folder = useMemo(() => folders.find(f => f.id === folderId), [folders, folderId]);
  const subfolders = useMemo(() => folders.filter(f => f.parentId === folderId).sort(byFolderName), [folders, folderId]);

  const breadcrumbs = useMemo(() => {
    const crumbs = [];
    let current = folders.find(f => f.id === folderId);
    while (current) {
      crumbs.unshift(current);
      current = current.parentId ? folders.find(f => f.id === current.parentId) : null;
    }
    return crumbs;
  }, [folders, folderId]);

  const handleLoadMore = useCallback(async () => {
    if (loadingMoreRef.current) return;
    if (offsetRef.current >= mediaTotalRef.current) return;
    if (!folderRef.current) return;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    try {
      const loadMoreOpts = { folder: folderRef.current.path, limit: PAGE_SIZE, offset: offsetRef.current, ...(sortRef.current && { sort: sortRef.current }) };
      if (searchRef.current) loadMoreOpts.search = searchRef.current;
      const { items: more } = await fetchMedia(loadMoreOpts);
      if (more.length > 0) {
        offsetRef.current += more.length;
        setDirectMedia(prev => {
          const existingIds = new Set(prev.map(m => m.id));
          const combined = [...prev, ...more.filter(m => !existingIds.has(m.id))];
          return applySort(combined, sortRef.current);
        });
      }
    } catch (err) { console.error('Failed to load more media:', err); }
    finally { loadingMoreRef.current = false; setLoadingMore(false); }
  }, []);

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
      const { items, total } = await fetchMedia({ folder: f.path, subtree: true, limit: PAGE_SIZE, random: true });
      if (items.length === 0) return;
      pendingShuffle.current = true;
      slideshow.start(items, { order: 'sequential', total, loadMore: () => fetchMedia({ folder: f.path, subtree: true, limit: PAGE_SIZE, random: true }).then(d => d.items) });
    } catch (err) { console.error('Failed to fetch subtree media for shuffle:', err); }
  };

  useEffect(() => {
    if (pendingShuffle.current && slideshow.active && slideshow.current) {
      pendingShuffle.current = false;
      navigate(`/media/${slideshow.current.id}`);
    }
  }, [slideshow.active, slideshow.current, navigate]);

  if (loading) return <PageLoader message={loadingMessage} />;

  const folderName = folder ? folder.path.split(/[/\\]/).filter(Boolean).pop() || 'Folder' : 'Folder';
  const subtreeTotal = folder?.subtreeMediaCount || 0;

  const itemLabel = (() => {
    if (mediaTotal === 0) return null;
    const showing = directMedia.length;
    return showing < mediaTotal
      ? `${showing.toLocaleString()} of ${mediaTotal.toLocaleString()} items`
      : `${mediaTotal.toLocaleString()} item${mediaTotal !== 1 ? 's' : ''}`;
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
            {subfolders.length > 0 && `${subfolders.length} folder${subfolders.length !== 1 ? 's' : ''}`}
            {subfolders.length > 0 && itemLabel && ', '}
            {itemLabel}
            {contentReady && subfolders.length === 0 && !itemLabel && '0 items'}
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
            onChange={e => { const v = e.target.value; setSort(v); sortRef.current = v; }}
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

      {subfolders.length > 0 && !debouncedSearch && (
        <div className="item-grid">
          {subfolders.map(sub => <FolderCard key={sub.id} folder={sub} />)}
        </div>
      )}

      {!contentReady ? (
        <div className="loading-row" style={{ paddingTop: 48, paddingBottom: 48 }}>
          <Spinner size="lg" />
        </div>
      ) : directMedia.length > 0 ? (
        <>
          <MediaGrid
            items={directMedia}
            onItemClick={m => navigate(`/media/${m.id}`)}
            onItemLike={likeMedia}
            onNearEnd={directMedia.length < mediaTotal ? handleLoadMore : undefined}
          />
          {loadingMore && (
            <div className="loading-row">
              <Spinner size="sm" />
              <span>Loading more items…</span>
            </div>
          )}
        </>
      ) : debouncedSearch ? (
        <EmptyState
          icon={<Icon name="search" className="icon-2xl" />}
          title="No results"
          description={`No media matching "${debouncedSearch}".`}
        />
      ) : subfolders.length === 0 ? (
        <EmptyState
          icon={<Icon name="folder" className="icon-2xl" />}
          title="Folder not found"
          description="This folder doesn't exist or contains no media."
        />
      ) : null}

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
