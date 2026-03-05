/**
 * @file HTML5 video player wrapper.
 */

import { useRef, useEffect } from 'react';

/**
 * Video player component with play/pause controls.
 *
 * @param {Object} props
 * @param {string} props.src - Video source URL
 * @param {boolean} [props.autoPlay=false] - Auto-play on mount
 * @param {Function} [props.onEnded] - Called when video finishes
 * @param {string} [props.className] - Additional CSS classes
 */
export default function MediaPlayer({
  src,
  autoPlay = false,
  onEnded,
  className = '',
}) {
  const videoRef = useRef(null);

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
}
