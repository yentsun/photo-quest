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
import { fetchFolders, fetchMedia } from '../../utils/api.js';
import { FolderCard } from '../media/index.js';
import { MediaGrid } from '../media/index.js';
import { EmptyState } from '../layout/index.js';
import { Button, Icon, PageLoader, Spinner } from '../ui/index.js';

const PAGE_SIZE = 200;

export default function FolderPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { likeMedia } = useMediaActions();
  const { signal } = useRefresh();
  const slideshow = useSlideshow();
  const pendingShuffle = useRef(false);

  /* Clear slideshow when entering folder browse mode. */
  useEffect(() => { slideshow.stop(); }, []);  // eslint-disable-line react-hooks/exhaustive-deps

  const [folders, setFolders] = useState([]);
  const [directMedia, setDirectMedia] = useState([]);
  const [mediaTotal, setMediaTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMessage, setLoadingMessage] = useState('Fetching folder list…');
  const [loadingMore, setLoadingMore] = useState(false);
  /* Stable refs so handleLoadMore doesn't need to be recreated on every append. */
  const loadingMoreRef = useRef(false);
  const offsetRef = useRef(0);       // items currently loaded (next fetch offset)
  const mediaTotalRef = useRef(0);   // mirrors mediaTotal for use in stable callback
  const folderRef = useRef(null);    // mirrors folder for use in stable callback

  const folderId = Number(id);

  /* Fetch folders + first page of direct media on mount / signal change. */
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadingMessage('Fetching folder list…');
    setDirectMedia([]);
    setMediaTotal(0);
    offsetRef.current = 0;

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
          const { items, total } = await fetchMedia({
            folder: found.path,
            limit: PAGE_SIZE,
            offset: 0,
          });
          if (!cancelled) {
            setDirectMedia(items);
            setMediaTotal(total);
            mediaTotalRef.current = total;
            offsetRef.current = items.length;
          }
        }
      } catch (err) {
        console.error('Failed to load folder data:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => { cancelled = true; };
  }, [folderId, signal]);

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
      const { items: more } = await fetchMedia({
        folder: folderRef.current.path,
        limit: PAGE_SIZE,
        offset: offsetRef.current,
      });
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
          <button
            onClick={() => navigate('/dashboard')}
            className="hover:text-white transition-colors shrink-0"
          >
            Library
          </button>
          {breadcrumbs.map((crumb, i) => {
            const name = crumb.path.split(/[/\\]/).filter(Boolean).pop();
            const isLast = i === breadcrumbs.length - 1;
            return (
              <span key={crumb.id} className="flex items-center gap-1 shrink-0">
                <span className="text-gray-600">/</span>
                {isLast ? (
                  <span className="text-white">{name}</span>
                ) : (
                  <button
                    onClick={() => navigate(`/folder/${crumb.id}`)}
                    className="hover:text-white transition-colors"
                  >
                    {name}
                  </button>
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
            {subfolders.length === 0 && !itemLabel && '0 items'}
          </p>
        </div>
        {subtreeTotal > 0 && (
          <Button variant="secondary" onClick={handleShuffle}>
            Shuffle
          </Button>
        )}
      </div>

      {/* Subfolders */}
      {subfolders.length > 0 && (
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
      {directMedia.length > 0 ? (
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
      ) : subfolders.length === 0 ? (
        <EmptyState
          icon={folderIcon}
          title="Folder not found"
          description="This folder doesn't exist or contains no media."
        />
      ) : null}
    </div>
  );
}
