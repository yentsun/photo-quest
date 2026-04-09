/**
 * @file Loading spinner component.
 */

/**
 * Animated loading spinner.
 *
 * @param {Object} props
 * @param {'sm' | 'md' | 'lg'} [props.size='md'] - Size variant
 * @param {string} [props.className] - Additional CSS classes
 */
export default function Spinner({ size = 'md', overlay = false, className = '' }) {
  const sizes = {
    sm: 'w-4 h-4 border-2',
    md: 'w-8 h-8 border-3',
    lg: 'w-12 h-12 border-4',
  };

  const spinner = (
    <div
      className={`${sizes[size]} border-gray-600 border-t-blue-500 rounded-full animate-spin ${className}`}
      role="status"
      aria-label="Loading"
    />
  );

  if (overlay) {
    return (
      <div className="absolute inset-0 flex items-center justify-center">
        {spinner}
      </div>
    );
  }

  return spinner;
}
