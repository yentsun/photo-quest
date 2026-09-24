import { useRef, useEffect, useImperativeHandle, forwardRef, useState } from 'react';
import Button from '../ui/Button.jsx';
import Loader from '../ui/Loader.jsx';

const SPEED_STORAGE_KEY = 'player_speed';
/* Playback speeds offered by the toggle, cycled in this order. */
const SPEEDS = [1, 0.5, 0.25];

/* Reads the saved playback speed, falling back to normal speed when nothing
 * valid is stored (or storage is unavailable, e.g. private browsing). */
function readSavedSpeed() {
  try {
    const saved = Number(localStorage.getItem(SPEED_STORAGE_KEY));
    return SPEEDS.includes(saved) ? saved : 1;
  } catch {
    return 1;
  }
}

const MediaPlayer = forwardRef(function MediaPlayer({
  src,
  title = '',
  autoPlay = true,
  onEnded,
  onError,
  mediaRef,
  mediaProps,
  magnifierActive = false,
  className = '',
}, ref) {
  const containerRef = useRef(null);
  const localVideoRef = useRef(null);
  const videoRef = mediaRef ?? localVideoRef;
  const [buffering, setBuffering] = useState(true);
  const [error, setError] = useState(null);
  const [speed, setSpeed] = useState(readSavedSpeed);
  /* Mirror the native controls: shown on pointer movement, then faded out after
   * a short idle period (or as soon as the pointer leaves the player). */
  const [controlsVisible, setControlsVisible] = useState(false);
  const hideTimerRef = useRef(null);
  /* Offset of the overlay controls from the container's top-right corner, so
   * they sit on the picture rather than the letterbox bars. The video element
   * is aspect-fitted by its max-width/max-height, so its box *is* the picture. */
  const [overlayInset, setOverlayInset] = useState({ top: 10, right: 10 });
  /* Tracks whether autoplay has begun for the current source, so playback is
   * only ever started once per source. */
  const startedRef = useRef(false);

  const [renderedSrc, setRenderedSrc] = useState(src);
  if (src !== renderedSrc) {
    setRenderedSrc(src);
    setBuffering(true);
    startedRef.current = false;
  }

  useImperativeHandle(ref, () => ({
    togglePlay() {
      const v = videoRef.current;
      if (!v) return;
      v.paused ? v.play().catch(() => {}) : v.pause();
    },
    getCurrentTime() {
      return videoRef.current?.currentTime ?? 0;
    },
  }));

  /* Start playback as soon as a frame is available (HAVE_CURRENT_DATA). Gating
   * on a large buffered look-ahead can deadlock on connections/devices that
   * won't fetch ahead while paused, leaving the loader up forever. Once playing,
   * the browser buffers naturally; a brief stall only re-shows the translucent
   * loader over the current frame. */
  const maybeStartPlayback = () => {
    const v = videoRef.current;
    if (!v || startedRef.current) return;
    if (v.readyState < 2) return;
    startedRef.current = true;
    v.play().catch(() => {});
  };

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    try {
      const saved = localStorage.getItem('player_volume');
      if (saved !== null) {
        const { volume, muted } = JSON.parse(saved);
        v.volume = volume ?? 1;
        v.muted = muted ?? false;
      }
    } catch {}
    /* Re-apply on every source change (loading a new source resets the rate)
     * and whenever the user toggles the speed. */
    v.playbackRate = speed;
    v.defaultPlaybackRate = speed;
  }, [src, autoPlay, speed]);

  /* Keep the overlay controls aligned with the video's rendered box as the
   * viewport, the video's aspect ratio, or fullscreen state change. */
  useEffect(() => {
    const container = containerRef.current;
    const v = videoRef.current;
    if (!container || !v) return;

    const measure = () => {
      const c = container.getBoundingClientRect();
      const r = v.getBoundingClientRect();
      if (!r.width || !r.height) return;
      const next = { top: Math.round(r.top - c.top + 10), right: Math.round(c.right - r.right + 10) };
      setOverlayInset((prev) => (prev.top === next.top && prev.right === next.right ? prev : next));
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    observer.observe(v);
    window.addEventListener('resize', measure);
    document.addEventListener('fullscreenchange', measure);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', measure);
      document.removeEventListener('fullscreenchange', measure);
    };
  }, [src]);

  const handleVolumeChange = () => {
    const v = videoRef.current;
    if (!v) return;
    try {
      localStorage.setItem('player_volume', JSON.stringify({ volume: v.volume, muted: v.muted }));
    } catch {}
  };

  const nextSpeed = SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length];

  const cycleSpeed = () => {
    setSpeed(nextSpeed);
    try {
      localStorage.setItem(SPEED_STORAGE_KEY, String(nextSpeed));
    } catch {}
  };

  /* Native controls stay up while the video is paused and auto-hide during
   * playback, so the same rule drives the speed toggle. */
  const isPaused = () => videoRef.current?.paused ?? true;

  const scheduleHide = () => {
    clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => {
      if (!isPaused()) setControlsVisible(false);
    }, 2500);
  };

  const showControls = () => {
    setControlsVisible(true);
    scheduleHide();
  };

  const hideControls = () => {
    clearTimeout(hideTimerRef.current);
    if (!isPaused()) setControlsVisible(false);
  };

  useEffect(() => () => clearTimeout(hideTimerRef.current), []);

  return (
    <div className="media-player" ref={containerRef}>
      {buffering && !error && (
        <div className="media-player-state">
          <Loader message={title ? `Buffering "${title}"…` : 'Buffering…'} />
        </div>
      )}
      {error && (
        <div className="media-player-state">
          <p className="media-player-error">{error}</p>
        </div>
      )}
      <video
        {...mediaProps}
        ref={videoRef}
        src={src}
        preload="auto"
        className={['media-player-video', className].filter(Boolean).join(' ')}
        controls={!buffering && !magnifierActive}
        loop
        onEnded={onEnded}
        playsInline
        onLoadedData={maybeStartPlayback}
        onProgress={maybeStartPlayback}
        onCanPlay={maybeStartPlayback}
        onMouseMove={showControls}
        onMouseLeave={hideControls}
        onTouchStart={showControls}
        onWaiting={() => setBuffering(true)}
        onPlaying={() => { setBuffering(false); showControls(); }}
        onPlay={showControls}
        onPause={() => { clearTimeout(hideTimerRef.current); setControlsVisible(true); }}
        onVolumeChange={handleVolumeChange}
        onError={() => { setBuffering(false); setError('This video could not be played.'); onError?.(); }}
      />
      {!error && !magnifierActive && (
        <Button
          variant="ghost"
          size="sm"
          className={['media-player-speed', controlsVisible && 'is-visible'].filter(Boolean).join(' ')}
          style={overlayInset}
          aria-label={`Playback speed: ${speed}x`}
          title={`Playback speed ${speed}x (next: ${nextSpeed}x)`}
          onClick={cycleSpeed}
          onMouseEnter={() => { clearTimeout(hideTimerRef.current); setControlsVisible(true); }}
          onMouseLeave={scheduleHide}
        >
          {speed}x
        </Button>
      )}
    </div>
  );
});

export default MediaPlayer;
