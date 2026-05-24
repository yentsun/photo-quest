/**
 * @file Unified media viewer with prev/next navigation.
 * LAW 1.26: every media item has a shareable URL.
 * LAW 1.27: single viewer — folder mode navigates sequentially,
 *           slideshow mode navigates through shuffled list. No auto-advance.
 * LAW 1.30: in slideshow mode, left/right = shuffle nav, up/down = folder nav.
 */

import { useEffect, useCallback, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useMediaActions } from '../../hooks/useMedia.js';
import { useRefresh } from '../../contexts/RefreshContext.jsx';
import { useSlideshow } from '../../contexts/SlideshowContext.jsx';
import { MEDIA_TYPE } from '@photo-quest/shared';
import { ImageViewer, MediaPlayer, LikeButton } from '../media/index.js';
import { EmptyState } from '../layout/index.js';
import { Button, Icon, IconButton, Modal, PageLoader, Spinner } from '../ui/index.js';
import { getMediaUrl, downloadMedia, fetchMediaById, fetchMedia, fetchFolders, likeMedia as likeMediaApi } from '../../utils/api.js';
import { idbGetMediaById, idbGetMedia, idbGetFolders } from '../../services/idb.js';

export default function MediaPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { deleteMedia } = useMediaActions();
  const { signal } = useRefresh();
  const slideshow = useSlideshow();
  const [showInfo, setShowInfo] = useState(false);
  const playerRef = useRef(null);
  const [fileStatus, setFileStatus] = useState(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const viewerRef = useRef(null);

  /* In slideshow mode the current item is already in context — no fetch needed.
     Initialise from there so there is no flash of the page loader on slide changes. */
  const inSlideshow = slideshow.active;

  const [item, setItem] = useState(() => inSlideshow ? slideshow.current : null);
  const [folderMedia, setFolderMedia] = useState([]);
  const [folder, setFolder] = useState(null);
  const [loading, setLoading] = useState(!inSlideshow);
  const [loadingMessage, setLoadingMessage] = useState('Fetching media item…');

  /* ── Slideshow mode: mirror slideshow.current into local state. ─────────────────────
     The URL is driven by slideshow.currentIndex (see effect below); `id` updates on
     every slide but the data is already in the slideshow context.
     Always clear loading here — if the user previously visited in folder-browse mode,
     the folder-browse effect may have set loading=true and been cancelled before it
     could reset it, leaving a stale loading state that would show the page loader. */
  useEffect(() => {
    if (!inSlideshow) return;
    setItem(slideshow.current);
    setLoading(false);
  }, [inSlideshow, slideshow.current]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Folder-browse mode: fetch item + siblings by URL id. ──────────────────────────
     Only runs when NOT in slideshow.
     IDB-first: show cached item immediately so the page loader never appears for
     return visits. Server fetch then updates the displayed data silently. */
  useEffect(() => {
    if (inSlideshow) return;

    let cancelled = false;
    const mediaId = Number(id);

    const load = async () => {
      try {
        /* 1. Serve item from IDB instantly — hides the page loader on return visits. */
        const cachedItem = await idbGetMediaById(mediaId);
        if (!cancelled && cachedItem) { setItem(cachedItem); setLoading(false); }

        /* 2. Fetch fresh item from server (IDB is updated inside fetchMediaById). */
        setLoadingMessage('Fetching media item…');
        const mediaItem = await fetchMediaById(mediaId);
        if (cancelled) return;
        setItem(mediaItem);
        setLoading(false);

        /* 3. Load folder siblings — IDB-first, limited to 200 items.
              fetchFolders is intentionally skipped here; `folder` (the record used
              for the back-link) is loaded below after a cached pass. */
        if (mediaItem.folder) {
          /* IDB pass — show siblings immediately if cached. */
          const { items: cachedSiblings } = await idbGetMedia({ folder: mediaItem.folder, limit: 200 });
          if (!cancelled && cachedSiblings.length > 0) setFolderMedia(cachedSiblings);

          /* IDB pass for folder record (for back-link / delete fallback). */
          const cachedFolders = await idbGetFolders();
          if (!cancelled) setFolder(cachedFolders.find(f => f.path === mediaItem.folder) || null);

          /* Server refresh — update siblings and folder record. */
          setLoadingMessage('Loading folder context…');
          const [folderResult, allFolders] = await Promise.all([
            fetchMedia({ folder: mediaItem.folder, limit: 200 }),
            fetchFolders(),
          ]);
          if (cancelled) return;
          setFolderMedia(folderResult.items);
          setFolder(allFolders.find(f => f.path === mediaItem.folder) || null);
        }
      } catch (err) {
        console.error('Failed to load media:', err);
        if (!cancelled) setItem(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    setLoading(true);
    load();
    return () => { cancelled = true; };
  }, [id, inSlideshow, signal]); // eslint-disable-line react-hooks/exhaustive-deps

  /* Determine navigation list: slideshow items or folder media */
  const navItems = inSlideshow ? slideshow.items : folderMedia;
  const currentIndex = navItems.findIndex(m => m.id === Number(id));

  /* Slideshow: prev requires history; next wraps around. Folder mode is sequential. */
  const hasPrev = inSlideshow ? slideshow.history.length > 0 : currentIndex > 0;
  const hasNext = inSlideshow ? navItems.length > 1 : currentIndex < navItems.length - 1;

  /* Sync URL from slideshow state — avoids stale-closure bugs with rapid key presses.
     Only triggers when slideshow.currentIndex changes (not on folder up/down nav). */
  useEffect(() => {
    if (!inSlideshow || !slideshow.current) return;
    navigate(`/media/${slideshow.current.id}`, { replace: true });
  }, [inSlideshow, slideshow.currentIndex]); // eslint-disable-line react-hooks/exhaustive-deps

  /* Lazy-load next page when approaching the end of the current batch. */
  useEffect(() => {
    if (!inSlideshow) return;
    const remaining = slideshow.items.length - slideshow.currentIndex;
    const hasMore = slideshow.items.length < slideshow.total;
    if (hasMore && remaining <= 40) {
      slideshow.loadMore();
    }
  }, [inSlideshow, slideshow.currentIndex, slideshow.items.length, slideshow.total]); // eslint-disable-line react-hooks/exhaustive-deps

  const goPrev = useCallback(() => {
    if (!hasPrev) return;
    if (inSlideshow) {
      slideshow.prev();
    } else {
      navigate(`/media/${navItems[currentIndex - 1].id}`);
    }
  }, [hasPrev, inSlideshow, slideshow, navigate, navItems, currentIndex]);

  const goNext = useCallback(() => {
    if (!hasNext) return;
    if (inSlideshow) {
      slideshow.next();
    } else {
      navigate(`/media/${navItems[currentIndex + 1].id}`);
    }
  }, [hasNext, inSlideshow, slideshow, navigate, navItems, currentIndex]);

  /* ── Folder up/down navigation (LAW 1.30) — lazy, on-demand only. ──────────────────
     In slideshow mode we do NOT pre-fetch folder siblings. They are loaded only when
     the user actually presses up/down. The arrows are shown optimistically whenever
     the item belongs to a folder; once siblings load the arrows refine to exact bounds.
     In folder-browse mode folderMedia is already loaded by the browse effect above. */
  const [folderNavLoading, setFolderNavLoading] = useState(false);
  const folderNavInFlight = useRef(false);

  /* Returns the cached sibling list, fetching it first if not yet loaded. */
  const ensureFolderSiblings = useCallback(async () => {
    if (!item?.folder) return [];
    /* Cache hit — current item is present in the loaded list. */
    if (folderMedia.length > 0 && folderMedia.some(m => m.id === item.id)) return folderMedia;
    /* Guard against concurrent fetches triggered by rapid key presses. */
    if (folderNavInFlight.current) return folderMedia;
    folderNavInFlight.current = true;
    setFolderNavLoading(true);
    try {
      const { items } = await fetchMedia({ folder: item.folder });
      setFolderMedia(items);
      return items;
    } catch (err) {
      console.error('Failed to load folder siblings:', err);
      return [];
    } finally {
      folderNavInFlight.current = false;
      setFolderNavLoading(false);
    }
  }, [item, folderMedia]); // eslint-disable-line react-hooks/exhaustive-deps

  /* Optimistic: show arrows whenever item is in a folder.
     If siblings are already loaded, refine based on actual position. */
  const folderIndex = folderMedia.length > 0 ? folderMedia.findIndex(m => m.id === Number(id)) : -1;
  const hasFolderPrev = inSlideshow && !!item?.folder && (folderIndex < 0 || folderIndex > 0);
  const hasFolderNext = inSlideshow && !!item?.folder && (folderIndex < 0 || folderIndex < folderMedia.length - 1);

  const goFolderPrev = useCallback(async () => {
    if (!hasFolderPrev) return;
    const siblings = await ensureFolderSiblings();
    const idx = siblings.findIndex(m => m.id === Number(id));
    if (idx > 0) navigate(`/media/${siblings[idx - 1].id}`);
  }, [hasFolderPrev, ensureFolderSiblings, id, navigate]);

  const goFolderNext = useCallback(async () => {
    if (!hasFolderNext) return;
    const siblings = await ensureFolderSiblings();
    const idx = siblings.findIndex(m => m.id === Number(id));
    if (idx >= 0 && idx < siblings.length - 1) navigate(`/media/${siblings[idx + 1].id}`);
  }, [hasFolderNext, ensureFolderSiblings, id, navigate]);

  /* Fullscreen toggle (LAW 1.37) */
  const toggleFullscreen = useCallback(() => {
    if (!viewerRef.current) return;
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      viewerRef.current.requestFullscreen();
    }
  }, []);

  /* Optimistic like — instant UI update, rollback on failure. */
  const handleLike = useCallback(async () => {
    if (!item) return;
    const originalLikes = item.likes || 0;
    setItem(prev => ({ ...prev, likes: originalLikes + 1 }));
    try {
      await likeMediaApi(item.id);
    } catch (err) {
      console.error('Failed to like media:', err);
      setItem(prev => ({ ...prev, likes: originalLikes }));
    }
  }, [item]);

  /* Delete current media and navigate to the next item (issue #4) */
  const { removeItem: removeSlideshowItem } = slideshow;
  const handleDelete = useCallback(async () => {
    if (!item) return;
    if (!confirm(`Delete "${item.title}"?\n\nThis will remove it from the library AND delete the file from disk.`)) return;
    const nextItem = navItems[currentIndex + 1] ?? navItems[currentIndex - 1];
    const deletedId = item.id;
    /* Navigate first to avoid re-fetch of deleted item */
    if (nextItem) {
      navigate(`/media/${nextItem.id}`, { replace: true });
    } else {
      navigate(folder ? `/folder/${folder.id}` : '/dashboard', { replace: true });
    }
    if (inSlideshow) removeSlideshowItem(deletedId);
    try {
      await deleteMedia(deletedId);
    } catch (err) {
      console.error('Failed to delete media:', err);
    }
  }, [item, navItems, currentIndex, navigate, folder, inSlideshow, removeSlideshowItem, deleteMedia]);

  /* Sync fullscreen state with browser events */
  useEffect(() => {
    const onFsChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  /* Keyboard navigation */
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'ArrowLeft') goPrev();
      if (e.key === 'ArrowRight') goNext();
      if (e.key === 'ArrowUp') { e.preventDefault(); goFolderPrev(); }
      if (e.key === 'ArrowDown') { e.preventDefault(); goFolderNext(); }
      if (e.key === ' ') { e.preventDefault(); playerRef.current?.togglePlay(); }
      if (e.key === 'Enter') { e.preventDefault(); handleLike(); }
      if (e.key === 'i') setShowInfo(prev => !prev);
      if (e.key === 'f') toggleFullscreen();
      if (e.key === 'Delete') handleDelete();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [goPrev, goNext, goFolderPrev, goFolderNext, handleLike, toggleFullscreen, handleDelete]);

  /* Fetch file status when info modal opens */
  useEffect(() => {
    if (!showInfo || !item) return;
    setFileStatus(null);
    fetch(`/media/${item.id}/status`)
      .then(r => r.json())
      .then(setFileStatus)
      .catch(() => setFileStatus({ ok: false, error: 'Could not check status' }));
  }, [showInfo, item]);

  if (loading) {
    return <PageLoader message={loadingMessage} />;
  }

  if (!item) {
    return (
      <EmptyState
        icon={<Icon name="image" className="w-16 h-16" />}
        title="Media not found"
        description="This media item doesn't exist."
        action={{ label: 'Go to Library', onClick: () => navigate('/dashboard') }}
      />
    );
  }

  const isImage = item.type === MEDIA_TYPE.IMAGE;
  const mediaUrl = getMediaUrl(item);
  const folderName = item.folder?.split(/[/\\]/).filter(Boolean).pop();

  return (
    <div ref={viewerRef} className={`flex flex-col ${isFullscreen ? 'h-screen bg-black' : 'h-[calc(100vh-4rem)]'}`}>
      {/* Media display with nav arrows */}
      <div className="flex-1 flex items-center justify-center bg-black overflow-hidden relative group/viewer">
        {isImage ? (
          <ImageViewer src={mediaUrl} alt={item.title} />
        ) : (
          <MediaPlayer ref={playerRef} src={mediaUrl} title={item.title} />
        )}

        {/* Left arrow */}
        {hasPrev && (
          <button
            onClick={goPrev}
            className={`absolute left-2 top-1/2 -translate-y-1/2 p-2 rounded-full bg-black/50 text-white/70 hover:text-white hover:bg-black/70 transition-all ${isFullscreen ? 'opacity-0 group-hover/viewer:opacity-100' : ''}`}
            title="Previous"
          >
            <Icon name="prev" className="w-8 h-8" />
          </button>
        )}

        {/* Right arrow */}
        {hasNext && (
          <button
            onClick={goNext}
            className={`absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-full bg-black/50 text-white/70 hover:text-white hover:bg-black/70 transition-all ${isFullscreen ? 'opacity-0 group-hover/viewer:opacity-100' : ''}`}
            title="Next"
          >
            <Icon name="next" className="w-8 h-8" />
          </button>
        )}

        {/* Up/down arrows for in-folder navigation during slideshow (LAW 1.30).
            Show a spinner while folder siblings are being fetched on first press. */}
        {hasFolderPrev && (
          <button
            onClick={goFolderPrev}
            disabled={folderNavLoading}
            className={`absolute top-2 left-1/2 -translate-x-1/2 p-2 rounded-full bg-black/50 text-white/70 hover:text-white hover:bg-black/70 transition-all ${isFullscreen ? 'opacity-0 group-hover/viewer:opacity-100' : ''}`}
            title="Previous in folder"
          >
            {folderNavLoading ? <Spinner size="sm" /> : <Icon name="up" className="w-8 h-8" />}
          </button>
        )}
        {hasFolderNext && (
          <button
            onClick={goFolderNext}
            disabled={folderNavLoading}
            className={`absolute bottom-2 left-1/2 -translate-x-1/2 p-2 rounded-full bg-black/50 text-white/70 hover:text-white hover:bg-black/70 transition-all ${isFullscreen ? 'opacity-0 group-hover/viewer:opacity-100' : ''}`}
            title="Next in folder"
          >
            {folderNavLoading ? <Spinner size="sm" /> : <Icon name="down" className="w-8 h-8" />}
          </button>
        )}

        {/* Fullscreen toggle button */}
        <button
          onClick={toggleFullscreen}
          className={`absolute top-2 right-2 p-2 rounded-full bg-black/50 text-white/70 hover:text-white hover:bg-black/70 transition-all ${isFullscreen ? 'opacity-0 group-hover/viewer:opacity-100' : ''}`}
          title={isFullscreen ? 'Exit fullscreen (F)' : 'Fullscreen (F)'}
        >
          <Icon name={isFullscreen ? 'minimize' : 'maximize'} className="w-5 h-5" />
        </button>

        {/* Minimal info overlay in fullscreen — position counter */}
        {isFullscreen && navItems.length > 1 && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-black/60 text-white/80 text-sm opacity-0 group-hover/viewer:opacity-100 transition-opacity">
            {currentIndex + 1} / {navItems.length}
          </div>
        )}
      </div>

      {/* Info bar — hidden in fullscreen */}
      {!isFullscreen && (
        <div className="bg-gray-900 border-t border-gray-800 px-4 py-3 flex items-center justify-between">
          <div className="min-w-0">
            <h1 className="text-white font-medium truncate">{item.title}</h1>
            <div className="flex items-center gap-2 text-sm text-gray-400">
              {inSlideshow ? (
                <span className="text-blue-400">Slideshow</span>
              ) : folder ? (
                <button
                  onClick={() => navigate(`/folder/${folder.id}`)}
                  className="hover:text-white transition-colors truncate"
                >
                  {folderName}
                </button>
              ) : null}
              {navItems.length > 1 && (
                <span>{currentIndex + 1} / {navItems.length}</span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <IconButton
              icon={<Icon name="info" />}
              label="Info"
              onClick={() => setShowInfo(true)}
            />
            <IconButton
              icon={<Icon name="download" />}
              label="Download"
              onClick={() => downloadMedia(item)}
            />
            <IconButton
              icon={<Icon name="trash" />}
              label="Delete"
              onClick={handleDelete}
            />
            <LikeButton
              count={item.likes || 0}
              onLike={handleLike}
            />
          </div>
        </div>
      )}

      {/* Media Info Modal (LAW 1.35) */}
      <Modal open={showInfo} onClose={() => setShowInfo(false)} title="Media Info">
        <div className="space-y-4">
          {/* File status check */}
          <div className="flex items-center gap-2 p-3 rounded-lg bg-gray-700/50">
            {fileStatus === null ? (
              <>
                <Spinner size="sm" />
                <span className="text-gray-400 text-sm">Checking file...</span>
              </>
            ) : fileStatus.ok ? (
              <>
                <span className="w-3 h-3 rounded-full bg-green-500 shrink-0" />
                <span className="text-green-400 text-sm">
                  File OK — {fileStatus.size ? `${(fileStatus.size / 1024 / 1024).toFixed(1)} MB` : 'readable'}
                </span>
              </>
            ) : (
              <>
                <span className="w-3 h-3 rounded-full bg-red-500 shrink-0" />
                <span className="text-red-400 text-sm">
                  File not accessible{fileStatus.error ? ` — ${fileStatus.error}` : ''}
                </span>
              </>
            )}
          </div>

          <table className="w-full text-sm">
            <tbody className="divide-y divide-gray-700">
              {[
                ['ID', item.id],
                ['Title', item.title],
                ['Type', item.type],
                ['Status', item.status],
                ['Path', item.path],
                ['Hash', item.hash],
                ['Size', fileStatus?.size ? `${(fileStatus.size / 1024 / 1024).toFixed(1)} MB` : item.size ? `${(item.size / 1024 / 1024).toFixed(1)} MB` : null],
                ['Codec', item.codec],
                ['Width', item.width],
                ['Height', item.height],
                ['Duration', item.duration ? `${Math.floor(item.duration / 60)}:${String(Math.floor(item.duration % 60)).padStart(2, '0')}` : null],
                ['Camera', item.camera],
                ['Date Taken', item.date_taken],
                ['Created', item.created_at],
              ].filter(([, v]) => v != null && v !== '').map(([label, value]) => (
                <tr key={label}>
                  <td className="py-2 pr-4 text-gray-400 whitespace-nowrap">{label}</td>
                  <td className="py-2 text-white break-all">{String(value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Modal>
    </div>
  );
}
