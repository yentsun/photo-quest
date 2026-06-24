import { useState } from 'react';
import Loader from '../ui/Loader.jsx';

export default function ImageViewer({ src, alt = '', className = '' }) {
  const [status, setStatus] = useState('loading');

  const [renderedSrc, setRenderedSrc] = useState(src);
  if (src !== renderedSrc) {
    setRenderedSrc(src);
    setStatus('loading');
  }

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
