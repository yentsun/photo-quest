/**
 * @file Compact icon-only button for toolbar actions.
 */

/**
 * Icon-only button with accessible label.
 *
 * @param {Object} props
 * @param {React.ReactNode} props.icon - Icon element to display
 * @param {string} props.label - Accessible label (aria-label)
 * @param {'default' | 'overlay'} [props.variant='default'] - Visual style
 * @param {'sm' | 'md' | 'lg'} [props.size='md'] - Size variant
 * @param {boolean} [props.disabled] - Disabled state
 * @param {string} [props.className] - Additional CSS classes
 * @param {Function} [props.onClick] - Click handler
 */
export default function IconButton({
  icon,
  label,
  variant = 'default',
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

  const variants = {
    default: 'bg-gray-800/80 text-white hover:bg-gray-700 transition-colors',
    overlay: 'bg-black/50 text-white/70 hover:text-white hover:bg-black/70 transition-all',
  };

  return (
    <button
      className={`inline-flex items-center justify-center rounded-full ${variants[variant]} focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed ${sizes[size]} ${className}`}
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
