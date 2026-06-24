import { useRef, useEffect, useImperativeHandle, forwardRef, useState } from 'react';

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
    if (autoPlay) v.play().catch(() => {});
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
          <span className="spinner spinner-lg" />
          <p className="media-player-label">{title ? `Buffering "${title}"…` : 'Buffering…'}</p>
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
        className={['media-player-video', className].filter(Boolean).join(' ')}
        controls
        loop
        onEnded={onEnded}
        playsInline
        onCanPlay={() => setBuffering(false)}
        onWaiting={() => setBuffering(true)}
        onPlaying={() => setBuffering(false)}
        onVolumeChange={handleVolumeChange}
        onError={() => { setBuffering(false); setError('This video could not be played.'); }}
      />
    </div>
  );
});

export default MediaPlayer;
