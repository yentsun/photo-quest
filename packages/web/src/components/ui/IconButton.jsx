/**
 * @file Compact icon-only button for toolbar actions.
 */

/**
 * Icon-only button with accessible label.
 *
 * @param {Object} props
 * @param {React.ReactNode} props.icon - Icon element to display
 * @param {string} props.label - Accessible label (aria-label)
 * @param {'sm' | 'md' | 'lg'} [props.size='md'] - Size variant
 * @param {boolean} [props.disabled] - Disabled state
 * @param {string} [props.className] - Additional CSS classes
 * @param {Function} [props.onClick] - Click handler
 */
export default function IconButton({
  icon,
  label,
  size = 'md',
  disabled = false,
  className = '',
  onClick,
  ...rest
}) {
  const sizes = {
    sm: 'w-8 h-8 text-lg',
    md: 'w-10 h-10 text-xl',
    lg: 'w-12 h-12 text-2xl',
  };

  return (
    <button
      className={`inline-flex items-center justify-center rounded-full bg-gray-800/80 text-white hover:bg-gray-700 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed ${sizes[size]} ${className}`}
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      {...rest}
    >
      {icon}
    </button>
  );
}
