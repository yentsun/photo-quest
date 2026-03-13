/**
 * @file Unified media viewer with prev/next navigation.
 * LAW 1.26: every media item has a shareable URL.
 * LAW 1.27: single viewer — folder mode navigates sequentially,
 *           slideshow mode navigates through shuffled list. No auto-advance.
 * LAW 1.30: in slideshow mode, left/right = shuffle nav, up/down = folder nav.
 */

import { useEffect, useCallback, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useMedia } from '../../hooks/useMedia.js';
import { useSlideshow } from '../../contexts/SlideshowContext.jsx';
import { MEDIA_TYPE } from '@photo-quest/shared';
import { ImageViewer, MediaPlayer, LikeButton } from '../media/index.js';
import { EmptyState } from '../layout/index.js';
import { Button, Icon, IconButton, Modal, Spinner } from '../ui/index.js';
import { getMediaUrl, downloadMedia } from '../../utils/api.js';

export default function MediaPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { media, loading, likeMedia, deleteMedia, folders, getMediaByFolder } = useMedia();
  const slideshow = useSlideshow();
  const [showInfo, setShowInfo] = useState(false);
  const [fileStatus, setFileStatus] = useState(null); // null | { ok, exists, readable, size, error }

  const item = media.find(m => m.id === Number(id));

  /* Determine navigation list: slideshow items or folder media */
  const inSlideshow = slideshow.active;

  const folder = item ? folders.find(f => f.path === item.folder) : null;
  const folderMedia = item ? getMediaByFolder(item.folder) : [];

  const navItems = inSlideshow ? slideshow.items : folderMedia;
  const currentIndex = navItems.findIndex(m => m.id === Number(id));

  /* Slideshow wraps around; folder mode doesn't */
  const hasPrev = inSlideshow ? navItems.length > 1 : currentIndex > 0;
  const hasNext = inSlideshow ? navItems.length > 1 : currentIndex < navItems.length - 1;

  const goPrev = useCallback(() => {
    if (!hasPrev) return;
    if (inSlideshow) {
      slideshow.prev();
      const prevIndex = currentIndex === 0 ? navItems.length - 1 : currentIndex - 1;
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

  /* Keyboard navigation */
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'ArrowLeft') goPrev();
      if (e.key === 'ArrowRight') goNext();
      if (e.key === 'ArrowUp') { e.preventDefault(); goFolderPrev(); }
      if (e.key === 'ArrowDown') { e.preventDefault(); goFolderNext(); }
      if (e.key === 'Enter' && item) likeMedia(item);
      if (e.key === 'i') setShowInfo(prev => !prev);
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [goPrev, goNext, goFolderPrev, goFolderNext, item, likeMedia]);

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
    <div className="flex flex-col h-[calc(100vh-4rem)]">
      {/* Media display with nav arrows */}
      <div className="flex-1 flex items-center justify-center bg-black overflow-hidden relative">
        {isImage ? (
          <ImageViewer src={mediaUrl} alt={item.title} />
        ) : (
          <MediaPlayer src={mediaUrl} />
        )}

        {/* Left arrow */}
        {hasPrev && (
          <button
            onClick={goPrev}
            className="absolute left-2 top-1/2 -translate-y-1/2 p-2 rounded-full bg-black/50 text-white/70 hover:text-white hover:bg-black/70 transition-all"
            title="Previous"
          >
            <Icon name="prev" className="w-8 h-8" />
          </button>
        )}

        {/* Right arrow */}
        {hasNext && (
          <button
            onClick={goNext}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-full bg-black/50 text-white/70 hover:text-white hover:bg-black/70 transition-all"
            title="Next"
          >
            <Icon name="next" className="w-8 h-8" />
          </button>
        )}

        {/* Up/down arrows for in-folder navigation during slideshow (LAW 1.30) */}
        {hasFolderPrev && (
          <button
            onClick={goFolderPrev}
            className="absolute top-2 left-1/2 -translate-x-1/2 p-2 rounded-full bg-black/50 text-white/70 hover:text-white hover:bg-black/70 transition-all"
            title="Previous in folder"
          >
            <Icon name="up" className="w-8 h-8" />
          </button>
        )}
        {hasFolderNext && (
          <button
            onClick={goFolderNext}
            className="absolute bottom-2 left-1/2 -translate-x-1/2 p-2 rounded-full bg-black/50 text-white/70 hover:text-white hover:bg-black/70 transition-all"
            title="Next in folder"
          >
            <Icon name="down" className="w-8 h-8" />
          </button>
        )}
      </div>

      {/* Info bar */}
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
          {inSlideshow && (
            <Button
              variant="ghost"
              onClick={() => {
                slideshow.stop();
                if (folder) navigate(`/folder/${folder.id}`);
              }}
            >
              Stop
            </Button>
          )}
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
            onClick={async () => {
              if (!confirm(`Delete "${item.title}"?\n\nThis will remove it from the library AND delete the file from disk.`)) return;
              const nextItem = navItems[currentIndex + 1] || navItems[currentIndex - 1];
              await deleteMedia(item.id);
              if (nextItem && nextItem.id !== item.id) {
                navigate(`/media/${nextItem.id}`, { replace: true });
              } else {
                navigate(folder ? `/folder/${folder.id}` : '/dashboard', { replace: true });
              }
            }}
          />
          <LikeButton
            count={item.likes || 0}
            onLike={() => likeMedia(item)}
          />
        </div>
      </div>

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
                ['Path', item.path],
                ['Folder', item.folder],
                ['Status', item.status],
                ['Hash', item.hash],
                ['Width', item.width],
                ['Height', item.height],
                ['Likes', item.likes],
                ['Camera', item.camera],
                ['Date Taken', item.date_taken],
                ['Created', item.created_at],
                ['Updated', item.updated_at],
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
