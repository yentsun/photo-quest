/**
 * @file Full-size image display component.
 */

/**
 * Image viewer for slideshow and full-screen display.
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
  return (
    <img
      src={src}
      alt={alt}
      className={`w-full h-full object-contain ${className}`}
    />
  );
}
