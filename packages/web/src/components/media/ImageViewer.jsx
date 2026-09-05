import { useEffect, useState } from 'react';
import Loader from '../ui/Loader.jsx';

export default function ImageViewer({ src, alt = '', className = '' }) {
  const [status, setStatus] = useState('loading');

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
    <div className="image-viewer">
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
        src={src}
        alt={alt}
        className={['image-viewer-img', status !== 'loaded' ? 'image-viewer-img-hidden' : '', className].filter(Boolean).join(' ')}
        onLoad={() => setStatus('loaded')}
        onError={() => setStatus('error')}
      />
    </div>
  );
}
