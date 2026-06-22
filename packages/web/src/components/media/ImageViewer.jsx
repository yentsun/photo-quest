/**
 * @file Full-size image display component.
 */

import { useState } from 'react';
import Spinner from '../ui/Spinner.jsx';

/**
 * Image viewer for slideshow and full-screen display.
 * Shows loading state while image loads, error state on failure.
 *
 * @param {Object} props
 * @param {string} props.src - Image source URL
 * @param {string} [props.alt] - Alt text
 * @param {string} [props.className] - Additional CSS classes
 */
export default function ImageViewer({
  src,
  alt = '',
  className = '',
}) {
  const [status, setStatus] = useState('loading'); // loading | loaded | error

  // Track which src the current status belongs to.  When src changes we reset
  // status to 'loading' *during render* — before React commits the new img src
  // to the DOM.  A useEffect-based reset would run after the DOM update, which
  // means the browser can fire onLoad for a cached image first, setting status
  // to 'loaded', and then the effect resets it to 'loading' with nothing left
  // to bring it back → infinite spinner.
  const [renderedSrc, setRenderedSrc] = useState(src);
  if (src !== renderedSrc) {
    setRenderedSrc(src);
    setStatus('loading');
  }

  const label = alt ? `Loading "${alt}"…` : 'Loading image…';

  return (
    <>
      {status === 'loading' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
          <Spinner size="lg" />
          <p className="text-gray-200 text-sm font-medium tracking-wide">{label}</p>
        </div>
      )}
      {status === 'error' && (
        <div className="absolute inset-0 flex items-center justify-center text-gray-500">
          <p>Failed to load image</p>
        </div>
      )}
      <img
        src={src}
        alt={alt}
        className={`w-full h-full object-contain ${className} ${status !== 'loaded' ? 'invisible' : ''}`}
        onLoad={() => setStatus('loaded')}
        onError={() => setStatus('error')}
      />
    </>
  );
}
