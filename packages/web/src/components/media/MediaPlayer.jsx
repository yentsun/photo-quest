/**
 * @file HTML5 video player wrapper.
 */

import { useRef, useEffect, useImperativeHandle, forwardRef, useState } from 'react';
import Spinner from '../ui/Spinner.jsx';

/**
 * Video player component with play/pause controls.
 *
 * @param {Object} props
 * @param {string} props.src - Video source URL
 * @param {string} [props.title] - Title shown in the buffering indicator
 * @param {boolean} [props.autoPlay=false] - Auto-play on mount
 * @param {Function} [props.onEnded] - Called when video finishes
 * @param {string} [props.className] - Additional CSS classes
 */
const MediaPlayer = forwardRef(function MediaPlayer({
  src,
  title = '',
  autoPlay = false,
  onEnded,
  className = '',
}, ref) {
  const videoRef = useRef(null);
  const [buffering, setBuffering] = useState(true);

  // Same race-condition fix as ImageViewer: reset buffering during render so
  // it happens before the browser can fire onCanPlay for a cached/buffered src.
  const [renderedSrc, setRenderedSrc] = useState(src);
  if (src !== renderedSrc) {
    setRenderedSrc(src);
    setBuffering(true);
  }

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

  const label = title ? `Buffering "${title}"…` : 'Buffering video…';

  return (
    <div className="relative w-full h-full flex items-center justify-center">
      {buffering && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black z-10 pointer-events-none">
          <Spinner size="lg" />
          <p className="text-gray-200 text-sm font-medium tracking-wide">{label}</p>
        </div>
      )}
      <video
        ref={videoRef}
        src={src}
        className={`w-full h-full object-contain ${className}`}
        controls
        onEnded={onEnded}
        playsInline
        onCanPlay={() => setBuffering(false)}
        onWaiting={() => setBuffering(true)}
        onPlaying={() => setBuffering(false)}
      />
    </div>
  );
});

export default MediaPlayer;
