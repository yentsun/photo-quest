/**
 * @file Full-size image display component.
 */

import { useState, useEffect } from 'react';

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

  useEffect(() => {
    setStatus('loading');
  }, [src]);

  return (
    <>
      {status === 'loading' && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-gray-600 border-t-white rounded-full animate-spin" />
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
