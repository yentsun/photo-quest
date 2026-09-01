import { useRef, useEffect, useImperativeHandle, forwardRef, useState } from 'react';
import Loader from '../ui/Loader.jsx';

const MediaPlayer = forwardRef(function MediaPlayer({
  src,
  title = '',
  autoPlay = true,
  onEnded,
  className = '',
}, ref) {
  const videoRef = useRef(null);
  const [buffering, setBuffering] = useState(true);
  const [error, setError] = useState(null);
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
    const saved = localStorage.getItem('player_volume');
    if (saved !== null) {
      try {
        const { volume, muted } = JSON.parse(saved);
        v.volume = volume ?? 1;
        v.muted = muted ?? false;
      } catch {}
    }
  }, [src, autoPlay]);

  const handleVolumeChange = () => {
    const v = videoRef.current;
    if (!v) return;
    localStorage.setItem('player_volume', JSON.stringify({ volume: v.volume, muted: v.muted }));
  };

  return (
    <div className="media-player">
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
        ref={videoRef}
        src={src}
        preload="auto"
        className={['media-player-video', className].filter(Boolean).join(' ')}
        controls={!buffering}
        loop
        onEnded={onEnded}
        playsInline
        onLoadedData={maybeStartPlayback}
        onProgress={maybeStartPlayback}
        onCanPlay={maybeStartPlayback}
        onWaiting={() => setBuffering(true)}
        onPlaying={() => setBuffering(false)}
        onVolumeChange={handleVolumeChange}
        onError={() => { setBuffering(false); setError('This video could not be played.'); }}
      />
    </div>
  );
});

export default MediaPlayer;
