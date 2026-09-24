import { useEffect, useRef, useState } from 'react';
import Loader from '../ui/Loader.jsx';
import useMediaMagnifier from '../../hooks/useMediaMagnifier.js';

export default function ImageViewer({ src, alt = '', className = '', onMagnify }) {
  const [status, setStatus] = useState('loading');
  const containerRef = useRef(null);
  const mediaRef = useRef(null);
  const magnifier = useMediaMagnifier({ mediaRef, containerRef, src, enabled: status === 'loaded', onMagnify });

  useEffect(() => {
    let cancelled = false;
    setStatus('loading');
    const probe = new Image();
    probe.onload = () => { if (!cancelled) setStatus('loaded'); };
    probe.onerror = () => { if (!cancelled) setStatus('error'); };
    probe.src = src;
    /* If the image is already in the browser cache, `complete` is true
       synchronously — skip the loader so navigation feels instant rather than
       flashing on an already-loaded image. */
    if (probe.complete && probe.naturalWidth > 0) setStatus('loaded');
    return () => { cancelled = true; };
  }, [src]);

  return (
    <div className="image-viewer" ref={containerRef}>
      {status === 'loading' && (
        <div className="image-viewer-state">
          <Loader message={alt ? `"${alt}"…` : null} />
        </div>
      )}
      {status === 'error' && (
        <div className="image-viewer-state">
          <p className="image-viewer-error">Failed to load image</p>
        </div>
      )}
      <img
        {...magnifier.mediaProps}
        ref={mediaRef}
        src={src}
        alt={alt}
        className={['image-viewer-img', status !== 'loaded' ? 'image-viewer-img-hidden' : '', className].filter(Boolean).join(' ')}
        onLoad={() => setStatus('loaded')}
        onError={() => setStatus('error')}
      />
    </div>
  );
}
