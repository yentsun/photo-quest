/**
 * @file Badge component for counts and status indicators.
 */

/**
 * Small badge for displaying counts or status.
 *
 * @param {Object} props
 * @param {number | string} props.count - The value to display
 * @param {'default' | 'primary' | 'success' | 'warning' | 'error'} [props.variant='default'] - Color variant
 * @param {string} [props.className] - Additional CSS classes
 */
export default function Badge({ count, variant = 'default', className = '' }) {
  const variants = {
    default: 'bg-gray-600 text-white',
    primary: 'bg-blue-600 text-white',
    success: 'bg-green-600 text-white',
    warning: 'bg-yellow-600 text-white',
    error: 'bg-red-600 text-white',
  };

  return (
    <span className={`inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1.5 text-xs font-medium rounded-full ${variants[variant]} ${className}`}>
      {count}
    </span>
  );
}
