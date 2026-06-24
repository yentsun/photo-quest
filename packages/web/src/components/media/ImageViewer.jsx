import { useState } from 'react';
import Spinner from '../ui/Spinner.jsx';

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
          <Spinner size="lg" />
          <p className="image-viewer-label">{alt ? `Loading "${alt}"…` : 'Loading…'}</p>
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
