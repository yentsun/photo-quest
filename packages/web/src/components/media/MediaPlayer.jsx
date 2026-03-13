/**
 * @file HTML5 video player wrapper.
 */

import { useRef, useEffect, useImperativeHandle, forwardRef } from 'react';

/**
 * Video player component with play/pause controls.
 *
 * @param {Object} props
 * @param {string} props.src - Video source URL
 * @param {boolean} [props.autoPlay=false] - Auto-play on mount
 * @param {Function} [props.onEnded] - Called when video finishes
 * @param {string} [props.className] - Additional CSS classes
 */
const MediaPlayer = forwardRef(function MediaPlayer({
  src,
  autoPlay = false,
  onEnded,
  className = '',
}, ref) {
  const videoRef = useRef(null);

  useImperativeHandle(ref, () => ({
    togglePlay() {
      const v = videoRef.current;
      if (!v) return;
      v.paused ? v.play().catch(() => {}) : v.pause();
    },
  }));

  useEffect(() => {
    if (autoPlay && videoRef.current) {
      videoRef.current.play().catch(() => {
        // Auto-play blocked by browser, ignore
      });
    }
  }, [src, autoPlay]);

  return (
    <video
      ref={videoRef}
      src={src}
      className={`w-full h-full object-contain ${className}`}
      controls
      onEnded={onEnded}
      playsInline
    />
  );
});

export default MediaPlayer;
