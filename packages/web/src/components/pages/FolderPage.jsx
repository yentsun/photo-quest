import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useMediaActions } from '../../hooks/useMedia.js';
import { useRefresh } from '../../contexts/RefreshContext.jsx';
import { useSlideshow } from '../../contexts/SlideshowContext.jsx';
import { fetchMedia, getLastFolders, getLastFolderMedia, scanMedia as scanMediaApi, renameFolder, fetchFoldersForParent } from '../../utils/api.js';
import { Select } from '../ui/index.js';
import { getPageCache, setPageCache, isPageCacheValid } from '../../utils/pageCache.js';
import usePersistedState from '../../hooks/usePersistedState.js';
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
  let result;
  if (sort === 'filename') {
    result = items.slice().sort(byName);
  } else {
    result = items.slice().sort((a, b) => {
      const aDate = a.date_taken || a.created_at || '';
      const bDate = b.date_taken || b.created_at || '';
      const dateCompare = bDate.localeCompare(aDate);
      if (dateCompare !== 0) return dateCompare;
      const pathA = a.path || '', pathB = b.path || '';
      return pathB.localeCompare(pathA);
    });
  }
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

function getFolderName(f) {
  return f.name || f.path.split(/[/\\]/).pop() || '';
}

function byFolderName(a, b) {
  return getFolderName(a).localeCompare(getFolderName(b), undefined, { numeric: true, sensitivity: 'base' });
}

function byFolderDate(a, b) {
  return b.id - a.id;
}

export default function FolderPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { likeMedia, removeFolder } = useMediaActions();
  const { signal, bump } = useRefresh();
  const slideshow = useSlideshow();
  const pendingShuffle = useRef(false);
  const [refreshing, setRefreshing] = useState(false);
  const [renamingFolder, setRenamingFolder] = useState(false);
  const [renameInput, setRenameInput] = useState('');
  const renameInputRef = useRef(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const searchRef = useRef('');

  const folderId = Number(id);
  const [sort, setSort] = usePersistedState(`folder:${folderId}:sort`, 'filename');
  const [page, setPage] = usePersistedState(`folder:${folderId}:page`, 0, {
    serialize: String,
    parse: (v) => Math.max(0, parseInt(v, 10) || 0),
  });
  const [mediaFilter, setMediaFilter] = usePersistedState('library:mediaFilter', 'all');

  const goToPage = useCallback((p) => {
    setPage(p);
  }, [setPage]);

  const mediaTypeParam = mediaFilter !== 'all' ? mediaFilter : undefined;
  const CACHE_KEY = `folder:${folderId}:${sort}:${mediaFilter}`;
  const _pc = isPageCacheValid(CACHE_KEY, signal) ? getPageCache(CACHE_KEY) : null;

  useEffect(() => { slideshow.stop(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const prevDebouncedSearch = useRef(debouncedSearch);
  useEffect(() => {
    if (prevDebouncedSearch.current !== debouncedSearch) goToPage(0);
    prevDebouncedSearch.current = debouncedSearch;
  }, [debouncedSearch]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const timer = setTimeout(() => { setDebouncedSearch(searchQuery); searchRef.current = searchQuery; }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const prevFolderIdForReset = useRef(folderId);
  useEffect(() => {
    if (prevFolderIdForReset.current !== folderId) {
      setSearchQuery('');
      setDebouncedSearch('');
      searchRef.current = '';
    }
    prevFolderIdForReset.current = folderId;
  }, [folderId]); // eslint-disable-line react-hooks/exhaustive-deps

  const _sc0Folders = getLastFolders();
  const _sc0Folder  = _sc0Folders?.find(f => f.id === folderId) ?? null;
  const _sc0Media   = !mediaTypeParam && !debouncedSearch && _sc0Folder ? getLastFolderMedia(_sc0Folder.path) : null;

  const [folders, setFolders] = useState(_pc?.data.folders ?? _sc0Folders ?? []);
  const [folderChain, setFolderChain] = useState(_pc?.data.chain ?? []);
  const [directMedia, setDirectMedia] = useState(_pc?.data.directMedia ?? _sc0Media?.items ?? []);
  const [loading, setLoading] = useState(!_pc && !_sc0Folders);
  const [loadingMessage, setLoadingMessage] = useState('Fetching folder list…');
  const [contentReady, setContentReady] = useState(!!_pc || !!_sc0Media);
  const contentReadyRef = useRef(!!_pc || !!_sc0Media);
  const contentReadyForIdRef = useRef(folderId);
  const serverLoadedRef = useRef(false);
  const folderRef = useRef(_pc?.data.folders?.find(f => f.id === folderId) ?? _sc0Folder);
  const prevFolderId = useRef(folderId);
  const prevSignal = useRef(signal);
  const prevSearch = useRef(debouncedSearch);
  const prevSort = useRef(sort);
  const prevFilter = useRef(mediaFilter);
  const directMediaRef = useRef(directMedia);
  directMediaRef.current = directMedia;

  useEffect(() => {
    const onlySortChanged = prevSort.current !== sort
      && prevFolderId.current === folderId
      && prevSignal.current === signal
      && prevSearch.current === debouncedSearch
      && prevFilter.current === mediaFilter;
    prevFolderId.current = folderId;
    prevSignal.current = signal;
    prevSearch.current = debouncedSearch;
    prevSort.current = sort;
    prevFilter.current = mediaFilter;

    if (onlySortChanged && directMediaRef.current.length > 0) {
      const sorted = applySort(directMediaRef.current, sort);
      setDirectMedia(sorted);
      setPageCache(CACHE_KEY, { folders, directMedia: sorted }, signal);
      return;
    }

    let cancelled = false;
    serverLoadedRef.current = false;
    setLoadingMessage('Fetching folder list…');
    const isSearching = Boolean(debouncedSearch);

    if (!isSearching && isPageCacheValid(CACHE_KEY, signal)) {
      const { folders: pf, directMedia: pm, chain: pc } = getPageCache(CACHE_KEY).data;
      setFolders(pf);
      setFolderChain(pc ?? []);
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
    const scMedia   = !isSearching && !mediaTypeParam && scFolder ? getLastFolderMedia(scFolder.path) : null;
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
        const { items } = await idbGetMedia({ folder: found.path, limit: FETCH_LIMIT, sort, type: mediaTypeParam });
        if (cancelled || items.length === 0 || scMedia || serverLoadedRef.current) return;
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
        const { items: allFolders, chain: folderChain } = await fetchFoldersForParent(folderId);
        if (cancelled) return;
        setFolders(allFolders);
        setFolderChain(folderChain);
        const found = folderChain[folderChain.length - 1];
        if (found) {
          folderRef.current = found;
          const folderName = found.path.split(/[/\\]/).filter(Boolean).pop() || 'folder';
          setLoadingMessage(`'${folderName}'…`);
          const fetchOpts = { folder: found.path, limit: FETCH_LIMIT, offset: 0, sort };
          if (mediaTypeParam) fetchOpts.type = mediaTypeParam;
          if (debouncedSearch) fetchOpts.search = debouncedSearch;
          const { items } = await fetchMedia(fetchOpts);
          if (!cancelled) {
            serverLoadedRef.current = true;
            const sorted = applySort(items, sort);
            setDirectMedia(sorted);
            if (!isSearching) {
              setPageCache(CACHE_KEY, { folders: allFolders, directMedia: sorted, chain: folderChain }, signal);
            }
          }
        }
      } catch (err) { console.error('Failed to load folder data:', err); }
      finally { if (!cancelled) { setLoading(false); contentReadyRef.current = true; contentReadyForIdRef.current = folderId; setContentReady(true); } }
    };
    load();
    return () => { cancelled = true; };
  }, [folderId, signal, debouncedSearch, sort, mediaFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  const folder = useMemo(() => folderChain[folderChain.length - 1] ?? null, [folderChain]);
  const subfolders = useMemo(() => folders.filter(f => f.parentId === folderId).sort(sort === 'date' ? byFolderDate : byFolderName), [folders, folderId, sort]);

  const allItems = useMemo(() => {
    if (debouncedSearch) return directMedia.map(m => ({ kind: 'media', item: m }));
    return [
      ...subfolders.map(f => ({ kind: 'folder', item: f })),
      ...directMedia.map(m => ({ kind: 'media', item: m })),
    ];
  }, [subfolders, directMedia, debouncedSearch]);

  const totalPages = Math.max(1, Math.ceil(allItems.length / PAGE_SIZE));
  const displayPage = Math.min(page, totalPages - 1);
  const displayItems = allItems.slice(displayPage * PAGE_SIZE, (displayPage + 1) * PAGE_SIZE);

  useEffect(() => {
    if (!contentReady) return;
    if (displayPage !== page) setPage(displayPage);
  }, [displayPage, page, setPage, contentReady]);

  useEffect(() => {
    document.querySelector('.page')?.scrollTo({ top: 0, behavior: 'instant' });
  }, [displayPage]);

  const breadcrumbs = useMemo(() => folderChain, [folderChain]);

  const handleRefresh = async () => {
    const f = folderRef.current;
    if (!f || refreshing) return;
    setRefreshing(true);
    try { await scanMediaApi(f.path); bump(); }
    catch (err) { console.error('Failed to refresh folder:', err); }
    finally { setRefreshing(false); }
  };

  const handleRemove = async () => {
    const f = folderRef.current;
    if (!f) return;
    const name = f.path.split(/[/\\]/).filter(Boolean).pop() || 'Folder';
    if (!confirm(`Remove "${name}" from library?\n\nFiles on disk are not deleted.`)) return;
    try {
      await removeFolder(f.id);
      navigate('/dashboard');
    } catch (err) { console.error('Failed to remove folder:', err); }
  };

  const startRename = () => {
    const f = folderRef.current;
    if (!f) return;
    setRenameInput(getFolderName(f));
    setRenamingFolder(true);
    setTimeout(() => renameInputRef.current?.select(), 0);
  };

  const saveRename = async () => {
    if (!renamingFolder) return;
    setRenamingFolder(false);
    const f = folderRef.current;
    if (!f) return;
    const trimmed = renameInput.trim();
    const current = getFolderName(f);
    if (trimmed === current) return;
    try {
      await renameFolder(f.id, trimmed || null);
      bump();
    } catch (err) { console.error('Failed to rename folder:', err); }
  };

  const handleShuffle = async () => {
    const f = folderRef.current;
    if (!f) return;
    try {
      const fetchOpts = { folder: f.path, subtree: true, random: true };
      if (mediaTypeParam) fetchOpts.type = mediaTypeParam;
      const { items, total } = await fetchMedia(fetchOpts);
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

  const showPageLoader = loading && !contentReady;

  const folderName = folder ? getFolderName(folder) || 'Folder' : 'Folder';
  const subtreeTotal = folder?.subtreeMediaCount || 0;

  const itemLabel = (() => {
    const total = allItems.length;
    if (total === 0) return null;
    if (totalPages <= 1) return `${total.toLocaleString()} item${total !== 1 ? 's' : ''}`;
    const start = displayPage * PAGE_SIZE + 1;
    const end = Math.min((displayPage + 1) * PAGE_SIZE, total);
    return `${start.toLocaleString()}–${end.toLocaleString()} of ${total.toLocaleString()} items`;
  })();

  return (
    <div className="page">
      {breadcrumbs.length > 0 && (
        <nav className="breadcrumb-nav">
          <Button variant="text" onClick={() => navigate('/dashboard')}>Library</Button>
          {breadcrumbs.map((crumb, i) => {
            const name = getFolderName(crumb);
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
          {renamingFolder ? (
            <input
              ref={renameInputRef}
              className="folder-page-rename-input"
              value={renameInput}
              onChange={e => setRenameInput(e.target.value)}
              onBlur={saveRename}
              onKeyDown={e => { if (e.key === 'Enter') saveRename(); if (e.key === 'Escape') setRenamingFolder(false); }}
              autoFocus
            />
          ) : (
            <h1 className="page-title">
              {folderName}
              {folder && (
                <button className="folder-title-rename-btn" onClick={startRename} title="Rename folder">
                  <Icon name="edit" className="icon-sm" />
                </button>
              )}
            </h1>
          )}
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
            onChange={e => { setSort(e.target.value); setPage(0); }}
            options={[
              { value: 'filename', label: 'Name' },
              { value: 'date', label: 'Date' },
            ]}
            title="Sort order"
          />
          <Select
            value={mediaFilter}
            onChange={e => { setMediaFilter(e.target.value); setPage(0); }}
            options={[
              { value: 'all', label: 'All' },
              { value: 'image', label: 'Photos' },
              { value: 'video', label: 'Videos' },
            ]}
            title="Media type"
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
          {folder && (
            <Button variant="danger" size="sm" onClick={handleRemove} title="Remove folder from library" icon={<Icon name="trash" className="icon-sm" />}>
              <span className="sm-show">Remove</span>
            </Button>
          )}
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
                : <MediaCard key={`m-${item.id}`} media={item} onClick={m => navigate(`/media/${m.id}`, { state: { sort } })} onLike={likeMedia} />
            )}
          </div>
          {totalPages > 1 && (
            <div className="pagination-row">
              <Button variant="ghost" size="sm" disabled={displayPage === 0} onClick={() => goToPage(displayPage - 1)} icon={<Icon name="prev" className="icon-sm" />} />
              {getPageNumbers(displayPage, totalPages).map((p, i) =>
                p === '…'
                  ? <span key={`ellipsis-${i}`} className="pagination-ellipsis">…</span>
                  : <Button key={p} variant={p === displayPage ? 'primary' : 'ghost'} size="sm" onClick={() => goToPage(p)}>{p + 1}</Button>
              )}
              <Button variant="ghost" size="sm" disabled={displayPage >= totalPages - 1} onClick={() => goToPage(displayPage + 1)} icon={<Icon name="next" className="icon-sm" />} />
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
            onKeyDown={e => { if (e.key === 'Enter') setSearchOpen(false); }}
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
