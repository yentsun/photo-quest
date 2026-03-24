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
import { Button, Icon, IconButton, Modal, Spinner } from '../ui/index.js';
import { getMediaUrl, downloadMedia, fetchMediaById, fetchMedia, fetchFolders, likeMedia as likeMediaApi } from '../../utils/api.js';

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

  const [item, setItem] = useState(null);
  const [folderMedia, setFolderMedia] = useState([]);
  const [folder, setFolder] = useState(null);
  const [loading, setLoading] = useState(true);

  /* Fetch the media item and its folder siblings. */
  useEffect(() => {
    let cancelled = false;
    const mediaId = Number(id);

    const load = async () => {
      try {
        const mediaItem = await fetchMediaById(mediaId);
        if (cancelled) return;
        setItem(mediaItem);

        /* Fetch folder media for navigation + folder record for link back. */
        const [folderResult, allFolders] = await Promise.all([
          mediaItem.folder ? fetchMedia({ folder: mediaItem.folder }) : { items: [] },
          fetchFolders(),
        ]);
        if (cancelled) return;
        setFolderMedia(folderResult.items);
        setFolder(allFolders.find(f => f.path === mediaItem.folder) || null);
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
  }, [id, signal]);

  /* Determine navigation list: slideshow items or folder media */
  const inSlideshow = slideshow.active;

  const navItems = inSlideshow ? slideshow.items : folderMedia;
  const currentIndex = navItems.findIndex(m => m.id === Number(id));

  /* Slideshow: prev requires history; next wraps around. Folder mode is sequential. */
  const hasPrev = inSlideshow ? slideshow.history.length > 0 : currentIndex > 0;
  const hasNext = inSlideshow ? navItems.length > 1 : currentIndex < navItems.length - 1;

  const goPrev = useCallback(() => {
    if (!hasPrev) return;
    if (inSlideshow) {
      const prevIndex = slideshow.history[slideshow.history.length - 1];
      slideshow.prev();
      navigate(`/media/${navItems[prevIndex].id}`);
    } else {
      navigate(`/media/${navItems[currentIndex - 1].id}`);
    }
  }, [hasPrev, inSlideshow, slideshow, navigate, navItems, currentIndex]);

  const goNext = useCallback(() => {
    if (!hasNext) return;
    if (inSlideshow) {
      slideshow.next();
      const nextIndex = (currentIndex + 1) % navItems.length;
      navigate(`/media/${navItems[nextIndex].id}`);
    } else {
      navigate(`/media/${navItems[currentIndex + 1].id}`);
    }
  }, [hasNext, inSlideshow, slideshow, navigate, navItems, currentIndex]);

  /* In slideshow mode, up/down navigate within the current folder (LAW 1.30) */
  const folderIndex = folderMedia.findIndex(m => m.id === Number(id));
  const hasFolderPrev = inSlideshow && folderIndex > 0;
  const hasFolderNext = inSlideshow && folderIndex < folderMedia.length - 1;

  const goFolderPrev = useCallback(() => {
    if (!hasFolderPrev) return;
    navigate(`/media/${folderMedia[folderIndex - 1].id}`);
  }, [hasFolderPrev, navigate, folderMedia, folderIndex]);

  const goFolderNext = useCallback(() => {
    if (!hasFolderNext) return;
    navigate(`/media/${folderMedia[folderIndex + 1].id}`);
  }, [hasFolderNext, navigate, folderMedia, folderIndex]);

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
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] gap-3">
        <Spinner size="lg" />
        <p className="text-gray-400 text-sm">Loading media...</p>
      </div>
    );
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
          <MediaPlayer ref={playerRef} src={mediaUrl} />
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

        {/* Up/down arrows for in-folder navigation during slideshow (LAW 1.30) */}
        {hasFolderPrev && (
          <button
            onClick={goFolderPrev}
            className={`absolute top-2 left-1/2 -translate-x-1/2 p-2 rounded-full bg-black/50 text-white/70 hover:text-white hover:bg-black/70 transition-all ${isFullscreen ? 'opacity-0 group-hover/viewer:opacity-100' : ''}`}
            title="Previous in folder"
          >
            <Icon name="up" className="w-8 h-8" />
          </button>
        )}
        {hasFolderNext && (
          <button
            onClick={goFolderNext}
            className={`absolute bottom-2 left-1/2 -translate-x-1/2 p-2 rounded-full bg-black/50 text-white/70 hover:text-white hover:bg-black/70 transition-all ${isFullscreen ? 'opacity-0 group-hover/viewer:opacity-100' : ''}`}
            title="Next in folder"
          >
            <Icon name="down" className="w-8 h-8" />
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
                ['Path', item.path],
                ['Hash', item.hash],
                ['Width', item.width],
                ['Height', item.height],
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
