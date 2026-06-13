/**
 * @file Folder view page - shows subfolders and media for a folder ID.
 * LAW 2.7: maintains folder hierarchy with breadcrumb navigation.
 *
 * Media is fetched in pages of PAGE_SIZE. Scrolling to within 3 rows of the
 * end of the grid triggers the next page (same lazy-load pattern as the
 * slideshow).  The server returns the total count so we know when to stop.
 */

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useMediaActions } from '../../hooks/useMedia.js';
import { useRefresh } from '../../contexts/RefreshContext.jsx';
import { useSlideshow } from '../../contexts/SlideshowContext.jsx';
import { fetchFolders, fetchMedia, getLastFolders, getLastFolderMedia, scanMedia as scanMediaApi } from '../../utils/api.js';
import { idbGetFolders, idbGetMedia } from '../../services/idb.js';
import { FolderCard } from '../media/index.js';
import { MediaGrid } from '../media/index.js';
import { EmptyState } from '../layout/index.js';
import { Button, Icon, Input, Modal, PageLoader, Spinner } from '../ui/index.js';

const PAGE_SIZE = 200;

export default function FolderPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { likeMedia } = useMediaActions();
  const { signal, bump } = useRefresh();
  const slideshow = useSlideshow();
  const pendingShuffle = useRef(false);
  const [refreshing, setRefreshing] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const searchRef = useRef('');

  const folderId = Number(id);

  /* Clear slideshow when entering folder browse mode. */
  useEffect(() => { slideshow.stop(); }, []);  // eslint-disable-line react-hooks/exhaustive-deps

  /* Reset search when navigating to a different folder. */
  useEffect(() => {
    setSearchQuery('');
    setDebouncedSearch('');
    searchRef.current = '';
  }, [folderId]);

  /* Debounce search input by 300ms. */
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
      searchRef.current = searchQuery;
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  /* Sync cache lookup — instant first render when returning to a visited folder. */
  const _sc0Folders = getLastFolders();
  const _sc0Folder  = _sc0Folders?.find(f => f.id === folderId) ?? null;
  const _sc0Media   = _sc0Folder ? getLastFolderMedia(_sc0Folder.path) : null;

  const [folders, setFolders] = useState(_sc0Folders || []);
  const [directMedia, setDirectMedia] = useState(_sc0Media?.items ?? []);
  const [mediaTotal, setMediaTotal] = useState(_sc0Media?.total ?? 0);
  const [loading, setLoading] = useState(!_sc0Folders);
  const [loadingMessage, setLoadingMessage] = useState('Fetching folder list…');
  const [loadingMore, setLoadingMore] = useState(false);
  const [contentReady, setContentReady] = useState(!!_sc0Media);
  const loadingMoreRef = useRef(false);
  const offsetRef = useRef(_sc0Media?.items.length ?? 0);
  const mediaTotalRef = useRef(_sc0Media?.total ?? 0);
  const folderRef = useRef(_sc0Folder);

  /* Fetch folders + first page of direct media — IDB-first, then refresh from server. */
  useEffect(() => {
    let cancelled = false;
    setLoadingMessage('Fetching folder list…');

    const isSearching = Boolean(debouncedSearch);

    /* Restore from sync cache (or clear for spinner) before async fetches begin.
       This runs on every dep change (folderId, signal, debouncedSearch) so navigation
       between folders shows the new folder's cached data instead of the previous one.
       Skip sync/IDB caches when a search query is active. */
    const scFolders = getLastFolders();
    const scFolder  = scFolders?.find(f => f.id === folderId);
    const scMedia   = !isSearching && scFolder ? getLastFolderMedia(scFolder.path) : null;

    if (!scFolders) setLoading(true);

    if (scMedia) {
      setDirectMedia(scMedia.items);
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

    /* 1. Serve stale data from IDB immediately — hides the spinner on return visits.
          Skip when sync cache already has data: IDB uses localeCompare while the
          server uses SQLite binary ASC, so on Cyrillic/Unicode paths they produce
          different orderings and the IDB render causes a visible jump before the
          server response arrives.
          Also skip when a search is active — IDB has no search index. */
    if (!isSearching) {
      idbGetFolders().then(async (cachedFolders) => {
        if (cancelled) return;
        const found = cachedFolders.find(f => f.id === folderId);
        if (!found) return;
        const { items, total } = await idbGetMedia({ folder: found.path, limit: PAGE_SIZE, sort: 'filename' });
        if (cancelled || items.length === 0 || scMedia) return;
        setFolders(cachedFolders);
        folderRef.current = found;
        mediaTotalRef.current = total;
        offsetRef.current = items.length;
        setDirectMedia(items);
        setMediaTotal(total);
        setLoading(false);
        setContentReady(true);
      }).catch(() => {}); // IDB miss is fine; server fetch below will cover it
    }

    /* 2. Refresh from server; replaces IDB data with authoritative server state. */
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
          const fetchOpts = { folder: found.path, limit: PAGE_SIZE, offset: 0, sort: 'filename' };
          if (debouncedSearch) fetchOpts.search = debouncedSearch;
          const { items, total } = await fetchMedia(fetchOpts);
          if (!cancelled) {
            offsetRef.current = items.length;
            mediaTotalRef.current = total;
            setDirectMedia(items);
            setMediaTotal(total);
          }
        }
      } catch (err) {
        console.error('Failed to load folder data:', err);
      } finally {
        if (!cancelled) {
          setLoading(false);
          setContentReady(true);
        }
      }
    };

    load();
    return () => { cancelled = true; };
  }, [folderId, signal, debouncedSearch]);

  const folder = useMemo(() => folders.find(f => f.id === folderId), [folders, folderId]);
  const subfolders = useMemo(() => folders.filter(f => f.parentId === folderId), [folders, folderId]);

  const breadcrumbs = useMemo(() => {
    const crumbs = [];
    let current = folders.find(f => f.id === folderId);
    while (current) {
      crumbs.unshift(current);
      current = current.parentId ? folders.find(f => f.id === current.parentId) : null;
    }
    return crumbs;
  }, [folders, folderId]);

  /** Fetch and append the next page of items. Uses stable refs to avoid stale closures. */
  const handleLoadMore = useCallback(async () => {
    if (loadingMoreRef.current) return;
    if (offsetRef.current >= mediaTotalRef.current) return;
    if (!folderRef.current) return;

    loadingMoreRef.current = true;
    setLoadingMore(true);
    try {
      const loadMoreOpts = { folder: folderRef.current.path, limit: PAGE_SIZE, offset: offsetRef.current, sort: 'filename' };
      if (searchRef.current) loadMoreOpts.search = searchRef.current;
      const { items: more } = await fetchMedia(loadMoreOpts);
      if (more.length > 0) {
        offsetRef.current += more.length;
        setDirectMedia(prev => {
          const existingIds = new Set(prev.map(m => m.id));
          return [...prev, ...more.filter(m => !existingIds.has(m.id))];
        });
      }
    } catch (err) {
      console.error('Failed to load more media:', err);
    } finally {
      loadingMoreRef.current = false;
      setLoadingMore(false);
    }
  }, []); // stable — reads from refs, no deps needed

  const handleMediaClick = (clickedMedia) => {
    navigate(`/media/${clickedMedia.id}`);
  };

  const handleRefresh = async () => {
    const f = folderRef.current;
    if (!f || refreshing) return;
    setRefreshing(true);
    try {
      await scanMediaApi(f.path);
      bump();
    } catch (err) {
      console.error('Failed to refresh folder:', err);
    } finally {
      setRefreshing(false);
    }
  };

  /* Shuffle: server randomises, we load 200 items then lazy-append more. */
  const handleShuffle = async () => {
    const f = folderRef.current;
    if (!f) return;
    try {
      const { items, total } = await fetchMedia({
        folder: f.path,
        subtree: true,
        limit: PAGE_SIZE,
        random: true,
      });
      if (items.length === 0) return;
      pendingShuffle.current = true;
      slideshow.start(items, {
        order: 'sequential', // already randomised server-side
        total,
        loadMore: () =>
          fetchMedia({ folder: f.path, subtree: true, limit: PAGE_SIZE, random: true })
            .then(d => d.items),
      });
    } catch (err) {
      console.error('Failed to fetch subtree media for shuffle:', err);
    }
  };

  /* Navigate to first shuffled item after slideshow starts. */
  useEffect(() => {
    if (pendingShuffle.current && slideshow.active && slideshow.current) {
      pendingShuffle.current = false;
      navigate(`/media/${slideshow.current.id}`);
    }
  }, [slideshow.active, slideshow.current, navigate]);

  if (loading) {
    return <PageLoader message={loadingMessage} />;
  }

  const folderIcon = <Icon name="folder" className="w-16 h-16" />;

  const folderName = folder
    ? folder.path.split(/[/\\]/).filter(Boolean).pop() || 'Folder'
    : 'Folder';

  const subtreeTotal = folder?.subtreeMediaCount || 0;

  /* Subtitle: "3 folders, 200 of 31 450 items" */
  const itemLabel = (() => {
    if (mediaTotal === 0) return null;
    const showing = directMedia.length;
    return showing < mediaTotal
      ? `${showing.toLocaleString()} of ${mediaTotal.toLocaleString()} items`
      : `${mediaTotal.toLocaleString()} item${mediaTotal !== 1 ? 's' : ''}`;
  })();

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      {/* Breadcrumbs */}
      {breadcrumbs.length > 0 && (
        <nav className="flex items-center gap-1 text-sm text-gray-400 mb-4 overflow-x-auto">
          <Button
            variant="text"
            onClick={() => navigate('/dashboard')}
            className="shrink-0"
          >
            Library
          </Button>
          {breadcrumbs.map((crumb, i) => {
            const name = crumb.path.split(/[/\\]/).filter(Boolean).pop();
            const isLast = i === breadcrumbs.length - 1;
            return (
              <span key={crumb.id} className="flex items-center gap-1 shrink-0">
                <span className="text-gray-600">/</span>
                {isLast ? (
                  <span className="text-white">{name}</span>
                ) : (
                  <Button
                    variant="text"
                    onClick={() => navigate(`/folder/${crumb.id}`)}
                  >
                    {name}
                  </Button>
                )}
              </span>
            );
          })}
        </nav>
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">{folderName}</h1>
          <p className="text-gray-400 text-sm">
            {subfolders.length > 0 && `${subfolders.length} folder${subfolders.length !== 1 ? 's' : ''}`}
            {subfolders.length > 0 && itemLabel && ', '}
            {itemLabel}
            {contentReady && subfolders.length === 0 && !itemLabel && '0 items'}
          </p>
        </div>
        <div className="flex gap-2">
          {subtreeTotal > 0 && (
            <Button variant="secondary" onClick={handleShuffle} icon={<Icon name="shuffle" className="w-4 h-4" />}>
              <span className="hidden sm:inline">Shuffle</span>
            </Button>
          )}
          {folder && (
            <Button variant="ghost" onClick={handleRefresh} disabled={refreshing} title="Rescan folder for new files" icon={<Icon name="refresh" className="w-4 h-4" />}>
              <span className="hidden sm:inline">Refresh</span>
            </Button>
          )}
          <Button
            variant={debouncedSearch ? 'secondary' : 'ghost'}
            onClick={() => setSearchOpen(true)}
            title="Search by title"
            icon={<Icon name="search" className="w-4 h-4" />}
          >
            <span className="hidden sm:inline">Search</span>
          </Button>
        </div>
      </div>

      {/* Subfolders */}
      {subfolders.length > 0 && !(debouncedSearch) && (
        <div className="mb-6">
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            {subfolders.map(sub => (
              <FolderCard
                key={sub.id}
                folder={sub}
              />
            ))}
          </div>
        </div>
      )}

      {/* Media Grid or Empty State */}
      {!contentReady ? (
        <div className="flex items-center justify-center py-16">
          <Spinner size="lg" />
        </div>
      ) : directMedia.length > 0 ? (
        <>
          <MediaGrid
            items={directMedia}
            onItemClick={handleMediaClick}
            onItemLike={likeMedia}
            onNearEnd={directMedia.length < mediaTotal ? handleLoadMore : undefined}
          />
          {loadingMore && (
            <div className="flex items-center justify-center gap-2 py-4">
              <Spinner size="sm" />
              <span className="text-gray-400 text-sm">Loading more items…</span>
            </div>
          )}
        </>
      ) : debouncedSearch ? (
        <EmptyState
          icon={<Icon name="search" className="w-16 h-16" />}
          title="No results"
          description={`No media matching "${debouncedSearch}".`}
        />
      ) : subfolders.length === 0 ? (
        <EmptyState
          icon={folderIcon}
          title="Folder not found"
          description="This folder doesn't exist or contains no media."
        />
      ) : null}
      {/* Search modal */}
      <Modal
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        title="Search"
      >
        <div className="relative">
          <Icon name="search" className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
          <Input
            type="search"
            placeholder="Search by title…"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="pl-9"
            autoFocus
          />
        </div>
        {debouncedSearch && (
          <Button
            variant="text"
            className="mt-3 text-sm"
            onClick={() => { setSearchQuery(''); setDebouncedSearch(''); searchRef.current = ''; }}
          >
            Clear search
          </Button>
        )}
      </Modal>
    </div>
  );
}
