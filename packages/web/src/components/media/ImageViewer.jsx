/**
 * @file Full-size image display component.
 */

import { useState, useCallback } from 'react';

/**
 * Image viewer for slideshow and full-screen display.
 * Keeps the previous image visible while the next one loads
 * so there is no spinner flash for preloaded/cached images.
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
  const [loadedSrc, setLoadedSrc] = useState(null);
  const [error, setError] = useState(false);

  const onLoad = useCallback((e) => {
    setLoadedSrc(e.currentTarget.src);
    setError(false);
  }, []);

  const onError = useCallback(() => {
    setError(true);
    setLoadedSrc(null);
  }, []);

  const showSpinner = !loadedSrc && !error;

  return (
    <>
      {showSpinner && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-gray-600 border-t-white rounded-full animate-spin" />
        </div>
      )}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center text-gray-500">
          <p>Failed to load image</p>
        </div>
      )}
      {/* Previously loaded image stays visible until the new one is ready */}
      {loadedSrc && loadedSrc !== src && (
        <img
          src={loadedSrc}
          alt={alt}
          className={`w-full h-full object-contain ${className} absolute inset-0`}
        />
      )}
      {/* Current image — hidden until loaded */}
      <img
        key={src}
        src={src}
        alt={alt}
        className={`w-full h-full object-contain ${className} ${loadedSrc !== src ? 'invisible' : ''}`}
        onLoad={onLoad}
        onError={onError}
      />
    </>
  );
}
