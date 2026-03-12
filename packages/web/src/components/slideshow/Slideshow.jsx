/**
 * @file Full-screen slideshow overlay component.
 */

import { useEffect, useCallback } from 'react';
import { useSlideshow } from '../../contexts/SlideshowContext.jsx';
import { useMedia } from '../../hooks/useMedia.js';
import { MEDIA_TYPE } from '@photo-quest/shared';
import { MediaPlayer, ImageViewer, LikeButton } from '../media/index.js';
import SlideshowControls from './SlideshowControls.jsx';
import { getMediaUrl, downloadMedia } from '../../utils/api.js';
import { Icon, IconButton } from '../ui/index.js';

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

  const mediaUrl = current ? getMediaUrl(current) : null;

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
        {!mediaUrl ? (
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
          icon={<Icon name="download" />}
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
