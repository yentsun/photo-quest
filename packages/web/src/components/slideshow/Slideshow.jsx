/**
 * @file Full-screen slideshow overlay component.
 */

import { useEffect, useCallback, useState } from 'react';
import { useSlideshow } from '../../contexts/SlideshowContext.jsx';
import { useMedia } from '../../hooks/useMedia.js';
import { MEDIA_TYPE } from '@photo-quest/shared';
import { MediaPlayer, ImageViewer, LikeButton } from '../media/index.js';
import SlideshowControls from './SlideshowControls.jsx';
import { getMediaUrl, isClientMedia, downloadMedia } from '../../utils/api.js';
import { IconButton } from '../ui/index.js';

/**
 * Full-screen slideshow overlay with auto-advance and controls.
 */
export default function Slideshow() {
  const {
    active,
    current,
    playing,
    interval,
    next,
    prev,
    stop,
    togglePlay,
    updateItem,
  } = useSlideshow();
  const { likeMedia } = useMedia();

  const handleLike = useCallback(() => {
    if (!current) return;
    // Update slideshow context immediately for instant UI feedback
    updateItem(current.id, { likes: (current.likes || 0) + 1 });
    // Also update global state and send to server
    likeMedia(current);
  }, [current, updateItem, likeMedia]);

  // Keyboard navigation
  const handleKeyDown = useCallback((e) => {
    if (!active) return;

    switch (e.key) {
      case 'Escape':
        stop();
        break;
      case 'ArrowRight':
        next();
        break;
      case 'ArrowLeft':
        prev();
        break;
      case ' ':
        e.preventDefault();
        togglePlay();
        break;
      default:
        break;
    }
  }, [active, stop, next, prev, togglePlay]);

  useEffect(() => {
    if (active) {
      document.addEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [active, handleKeyDown]);

  // Load media URL (handles both server and client-side media)
  const [mediaUrl, setMediaUrl] = useState(null);
  const [urlLoading, setUrlLoading] = useState(false);

  useEffect(() => {
    if (!active || !current) {
      setMediaUrl(null);
      return;
    }

    let mounted = true;
    setUrlLoading(true);

    getMediaUrl(current).then(url => {
      if (mounted) {
        setMediaUrl(url);
        setUrlLoading(false);
      }
    }).catch(err => {
      console.error('Failed to get media URL:', err);
      if (mounted) setUrlLoading(false);
    });

    return () => {
      mounted = false;
      // Revoke blob URLs when switching media
      if (mediaUrl && mediaUrl.startsWith('blob:')) {
        URL.revokeObjectURL(mediaUrl);
      }
    };
  }, [active, current]);

  // Auto-advance for images
  useEffect(() => {
    if (!active || !playing || !current || !mediaUrl) return;

    // Only auto-advance for images. Videos advance on 'ended' event.
    if (current.type !== MEDIA_TYPE.IMAGE) return;

    const timer = setTimeout(next, interval);
    return () => clearTimeout(timer);
  }, [active, playing, current, mediaUrl, interval, next]);

  if (!active || !current) return null;

  const isImage = current.type === MEDIA_TYPE.IMAGE;

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      {/* Media display area */}
      <div className="flex-1 flex items-center justify-center overflow-hidden">
        {urlLoading || !mediaUrl ? (
          <div className="text-white text-lg">Loading...</div>
        ) : isImage ? (
          <ImageViewer src={mediaUrl} alt={current.title} />
        ) : (
          <MediaPlayer
            src={mediaUrl}
            autoPlay={playing}
            onEnded={next}
          />
        )}
      </div>

      {/* Title overlay */}
      <div className="absolute top-0 left-0 right-0 p-4 bg-gradient-to-b from-black/70 to-transparent">
        <h2 className="text-white text-lg font-medium truncate">
          {current.title}
        </h2>
      </div>

      {/* Like and Download buttons */}
      <div className="absolute top-4 right-4 flex gap-2">
        <IconButton
          icon={
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
          }
          label="Download"
          onClick={() => downloadMedia(current)}
          size="md"
        />
        <LikeButton
          count={current.likes || 0}
          onLike={handleLike}
          size="lg"
        />
      </div>

      {/* Controls */}
      <SlideshowControls />
    </div>
  );
}
