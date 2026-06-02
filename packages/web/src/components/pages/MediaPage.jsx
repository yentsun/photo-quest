/**
 * @file Unified media viewer with prev/next navigation.
 * LAW 1.26: every media item has a shareable URL.
 * LAW 1.27: single viewer — folder mode navigates sequentially,
 *           slideshow mode navigates through shuffled list. No auto-advance.
 * LAW 1.30: in slideshow mode, left/right = shuffle nav, up/down = folder nav.
 */

import { useEffect, useCallback, useState, useRef, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useMediaActions } from '../../hooks/useMedia.js';
import { useRefresh } from '../../contexts/RefreshContext.jsx';
import { useSlideshow } from '../../contexts/SlideshowContext.jsx';
import { MEDIA_TYPE } from '@photo-quest/shared';
import { ImageViewer, MediaPlayer, LikeButton } from '../media/index.js';
import { EmptyState } from '../layout/index.js';
import { Button, Icon, IconButton, Modal, PageLoader, Spinner } from '../ui/index.js';
import { getMediaUrl, getThumbUrl, downloadMedia, fetchMediaById, fetchMedia, fetchFolders, likeMedia as likeMediaApi, renameMedia, getLastMediaItem } from '../../utils/api.js';
import { idbGetMediaById, idbGetMedia, idbGetFolders } from '../../services/idb.js';

export default function MediaPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { deleteMedia } = useMediaActions();
  const { signal } = useRefresh();
  const slideshow = useSlideshow();
  const [showInfo, setShowInfo] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  const titleInputRef = useRef(null);
  const playerRef = useRef(null);
  const [fileStatus, setFileStatus] = useState(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const viewerRef = useRef(null);
  const touchStartX = useRef(null);
  const touchStartY = useRef(null);

  /* In slideshow mode the current item is already in context — no fetch needed.
     Initialise from there so there is no flash of the page loader on slide changes.
     In folder-browse mode check the sync cache first: if the item was viewed in
     this session (or loaded as part of a shuffle batch) it resolves synchronously
     and the page renders without any loading state at all. */
  const inSlideshow = slideshow.active;

  const [item, setItem] = useState(() => {
    if (inSlideshow) return slideshow.current;
    return getLastMediaItem(Number(id)) || null;
  });
  const [folderMedia, setFolderMedia] = useState([]);
  const [folder, setFolder] = useState(null);
  const [folders, setFolders] = useState([]);
  const [loading, setLoading] = useState(!inSlideshow && !getLastMediaItem(Number(id)));
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
     Priority: sync cache → IDB → server.
     The full-page loader is only shown when nothing is cached — so pressing
     browser back (e.g. from shuffle) feels instant for previously viewed items. */
  useEffect(() => {
    if (inSlideshow) return;

    let cancelled = false;
    const mediaId = Number(id);

    const load = async () => {
      try {
        /* 1. Sync cache (module-level, zero-latency). */
        const syncHit = getLastMediaItem(mediaId);
        if (syncHit) {
          if (!cancelled) { setItem(syncHit); setLoading(false); }
        } else {
          /* 2. IDB fallback — still fast but async; show loader while waiting. */
          if (!cancelled) setLoading(true);
          const cachedItem = await idbGetMediaById(mediaId);
          if (!cancelled && cachedItem) { setItem(cachedItem); setLoading(false); }
        }

        /* 3. Fetch fresh item from server (always — silently updates the display). */
        setLoadingMessage('Fetching media item…');
        const mediaItem = await fetchMediaById(mediaId);
        if (cancelled) return;
        setItem(mediaItem);
        setLoading(false);

        /* 4. Load folder siblings — IDB-first, limited to 200 items. */
        if (mediaItem.folder) {
          /* IDB pass — show siblings immediately if cached. */
          const { items: cachedSiblings } = await idbGetMedia({ folder: mediaItem.folder, limit: 200 });
          if (!cancelled && cachedSiblings.length > 0) setFolderMedia(cachedSiblings);

          /* IDB pass for folder record (for back-link / delete fallback). */
          const cachedFolders = await idbGetFolders();
          if (!cancelled) {
            setFolders(cachedFolders);
            setFolder(cachedFolders.find(f => f.path === mediaItem.folder) || null);
          }

          /* Server refresh — update siblings and folder record. */
          setLoadingMessage('Loading folder context…');
          const [folderResult, allFolders] = await Promise.all([
            fetchMedia({ folder: mediaItem.folder, limit: 200 }),
            fetchFolders(),
          ]);
          if (cancelled) return;
          setFolderMedia(folderResult.items);
          setFolders(allFolders);
          setFolder(allFolders.find(f => f.path === mediaItem.folder) || null);
        }
      } catch (err) {
        console.error('Failed to load media:', err);
        if (!cancelled) setItem(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

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

  /* Preload the next 2 images in slideshow mode so right-arrow nav feels instant.
     Videos are skipped — preloading video streams is too expensive. */
  const preloadRefs = useRef([]);
  useEffect(() => {
    if (!inSlideshow) return;
    preloadRefs.current = [1, 2].flatMap(offset => {
      const next = slideshow.items[slideshow.currentIndex + offset];
      if (!next || next.type !== MEDIA_TYPE.IMAGE) return [];
      const img = new Image();
      img.src = getThumbUrl(next.id);
      return [img];
    });
  }, [inSlideshow, slideshow.currentIndex]); // eslint-disable-line react-hooks/exhaustive-deps

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
      const { items } = await fetchMedia({ folder: item.folder, sort: 'filename' });
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
     If siblings are already loaded, refine based on actual position.
     Use item.id (not the URL id) so the arrows update correctly right after
     setItem() is called in goFolderPrev/Next — before the URL changes. */
  const folderIndex = folderMedia.length > 0 && item ? folderMedia.findIndex(m => m.id === item.id) : -1;
  const hasFolderPrev = inSlideshow && !!item?.folder && (folderIndex < 0 || folderIndex > 0);
  const hasFolderNext = inSlideshow && !!item?.folder && (folderIndex < 0 || folderIndex < folderMedia.length - 1);

  const goFolderPrev = useCallback(async () => {
    if (!hasFolderPrev) return;
    const siblings = await ensureFolderSiblings();
    const idx = siblings.findIndex(m => m.id === Number(id));
    if (idx > 0) {
      setItem(siblings[idx - 1]);  // update display immediately — mirror effect won't fire (slideshow.current unchanged)
      navigate(`/media/${siblings[idx - 1].id}`);
    }
  }, [hasFolderPrev, ensureFolderSiblings, id, navigate]);

  const goFolderNext = useCallback(async () => {
    if (!hasFolderNext) return;
    const siblings = await ensureFolderSiblings();
    const idx = siblings.findIndex(m => m.id === Number(id));
    if (idx >= 0 && idx < siblings.length - 1) {
      setItem(siblings[idx + 1]);  // update display immediately
      navigate(`/media/${siblings[idx + 1].id}`);
    }
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

  const handleTouchStart = useCallback((e) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
  }, []);

  const handleTouchEnd = useCallback((e) => {
    if (touchStartX.current === null) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    const dy = e.changedTouches[0].clientY - touchStartY.current;
    touchStartX.current = null;
    touchStartY.current = null;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 10) { handleLike(); return; }
    if (Math.abs(dx) >= Math.abs(dy)) {
      if (Math.abs(dx) < 50) return;
      if (dx < 0) goNext(); else goPrev();
    } else {
      if (Math.abs(dy) < 50) return;
      if (dy < 0) goFolderNext(); else goFolderPrev();
    }
  }, [goNext, goPrev, goFolderNext, goFolderPrev, handleLike]);

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

  const handleTitleDoubleClick = useCallback(() => {
    if (!item) return;
    setTitleDraft(item.title);
    setEditingTitle(true);
    setTimeout(() => { titleInputRef.current?.select(); }, 0);
  }, [item]);

  const commitTitle = useCallback(async () => {
    const trimmed = titleDraft.trim();
    setEditingTitle(false);
    if (!trimmed || trimmed === item?.title) return;
    setItem(prev => ({ ...prev, title: trimmed }));
    try {
      await renameMedia(item.id, trimmed);
    } catch (err) {
      console.error('Failed to rename media:', err);
      setItem(prev => ({ ...prev, title: item.title }));
    }
  }, [titleDraft, item]);

  /* Keyboard navigation */
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.target.tagName === 'INPUT') return;
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

  const breadcrumbs = useMemo(() => {
    if (!folder) return [];
    const crumbs = [];
    let current = folder;
    while (current) {
      crumbs.unshift(current);
      current = current.parentId ? folders.find(f => f.id === current.parentId) : null;
    }
    return crumbs;
  }, [folders, folder]);

  const backTarget = folder ? `/folder/${folder.id}` : '/dashboard';

  return (
    <div ref={viewerRef} className={`flex flex-col ${isFullscreen ? 'h-screen bg-black' : 'h-[calc(100vh-4rem)]'}`}>
      {/* Top bar — hidden in fullscreen */}
      {!isFullscreen && (
        <div className="bg-gray-900 border-b border-gray-800 px-3 py-2 flex items-center gap-2 shrink-0">
          <IconButton
            icon={<Icon name="prev" className="w-4 h-4" />}
            label="Back"
            onClick={() => navigate(backTarget)}
          />
          <nav className="flex items-center gap-1 text-sm text-gray-400 overflow-x-auto">
            <Button variant="text" onClick={() => navigate('/dashboard')} className="shrink-0">
              Library
            </Button>
            {breadcrumbs.map((crumb) => {
              const name = crumb.path.split(/[/\\]/).filter(Boolean).pop();
              return (
                <span key={crumb.id} className="flex items-center gap-1 shrink-0">
                  <span className="text-gray-600">/</span>
                  <Button variant="text" onClick={() => navigate(`/folder/${crumb.id}`)}>
                    {name}
                  </Button>
                </span>
              );
            })}
          </nav>
        </div>
      )}

      {/* Media display with nav arrows */}
      <div
        className="flex-1 flex items-center justify-center bg-black overflow-hidden relative group/viewer"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        {isImage ? (
          <ImageViewer src={mediaUrl} alt={item.title} />
        ) : (
          <MediaPlayer ref={playerRef} src={mediaUrl} title={item.title} />
        )}

        {/* Left arrow */}
        {hasPrev && (
          <IconButton
            variant="overlay"
            icon={<Icon name="prev" className="w-8 h-8" />}
            label="Previous"
            size="lg"
            onClick={goPrev}
            className={`hidden sm:block absolute left-2 top-1/2 -translate-y-1/2 ${isFullscreen ? 'opacity-0 group-hover/viewer:opacity-100' : ''}`}
          />
        )}

        {/* Right arrow */}
        {hasNext && (
          <IconButton
            variant="overlay"
            icon={<Icon name="next" className="w-8 h-8" />}
            label="Next"
            size="lg"
            onClick={goNext}
            className={`hidden sm:block absolute right-2 top-1/2 -translate-y-1/2 ${isFullscreen ? 'opacity-0 group-hover/viewer:opacity-100' : ''}`}
          />
        )}

        {/* Up/down arrows for in-folder navigation during slideshow (LAW 1.30).
            Show a spinner while folder siblings are being fetched on first press. */}
        {hasFolderPrev && (
          <IconButton
            variant="overlay"
            icon={folderNavLoading ? <Spinner size="sm" /> : <Icon name="up" className="w-8 h-8" />}
            label="Previous in folder"
            size="lg"
            disabled={folderNavLoading}
            onClick={goFolderPrev}
            className={`hidden sm:block absolute top-2 left-1/2 -translate-x-1/2 ${isFullscreen ? 'opacity-0 group-hover/viewer:opacity-100' : ''}`}
          />
        )}
        {hasFolderNext && (
          <IconButton
            variant="overlay"
            icon={folderNavLoading ? <Spinner size="sm" /> : <Icon name="down" className="w-8 h-8" />}
            label="Next in folder"
            size="lg"
            disabled={folderNavLoading}
            onClick={goFolderNext}
            className={`hidden sm:block absolute bottom-2 left-1/2 -translate-x-1/2 ${isFullscreen ? 'opacity-0 group-hover/viewer:opacity-100' : ''}`}
          />
        )}

        {/* Fullscreen toggle button */}
        <IconButton
          variant="overlay"
          icon={<Icon name={isFullscreen ? 'minimize' : 'maximize'} className="w-5 h-5" />}
          label={isFullscreen ? 'Exit fullscreen (F)' : 'Fullscreen (F)'}
          onClick={toggleFullscreen}
          className={`absolute top-2 right-2 ${isFullscreen ? 'opacity-0 group-hover/viewer:opacity-100' : ''}`}
        />

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
            {editingTitle ? (
              <input
                ref={titleInputRef}
                className="bg-gray-800 text-white font-medium rounded px-1 w-full outline-none focus:ring-1 focus:ring-blue-500"
                value={titleDraft}
                onChange={e => setTitleDraft(e.target.value)}
                onBlur={commitTitle}
                onKeyDown={e => {
                  if (e.key === 'Enter') { e.preventDefault(); commitTitle(); }
                  if (e.key === 'Escape') { e.preventDefault(); setEditingTitle(false); }
                }}
              />
            ) : (
              <h1
                className="text-white font-medium truncate cursor-text select-none"
                onDoubleClick={handleTitleDoubleClick}
                title="Double-click to rename"
              >
                {item.title}
              </h1>
            )}
            <div className="flex items-center gap-2 text-sm text-gray-400">
              {inSlideshow && <span className="text-blue-400">Slideshow</span>}
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
