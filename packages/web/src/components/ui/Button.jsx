/**
 * @file Reusable button component with multiple variants.
 */

/**
 * Button component with primary, secondary, and ghost variants.
 *
 * @param {Object} props
 * @param {'primary' | 'secondary' | 'ghost'} [props.variant='primary'] - Visual style
 * @param {'sm' | 'md' | 'lg'} [props.size='md'] - Size variant
 * @param {React.ReactNode} [props.icon] - Optional icon to display before text
 * @param {React.ReactNode} props.children - Button content
 * @param {boolean} [props.disabled] - Disabled state
 * @param {string} [props.className] - Additional CSS classes
 * @param {Function} [props.onClick] - Click handler
 */
export default function Button({
  variant = 'primary',
  size = 'md',
  icon,
  children,
  disabled = false,
  className = '',
  onClick,
  ...rest
}) {
  const baseStyles = 'inline-flex items-center justify-center font-medium rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-900 disabled:opacity-50 disabled:cursor-not-allowed';

  const variants = {
    primary: 'bg-blue-600 text-white hover:bg-blue-700 focus:ring-blue-500',
    secondary: 'bg-gray-700 text-white hover:bg-gray-600 focus:ring-gray-500',
    ghost: 'bg-transparent text-gray-300 hover:bg-gray-800 focus:ring-gray-500',
  };

  const sizes = {
    sm: 'px-3 py-1.5 text-sm gap-1.5',
    md: 'px-4 py-2 text-base gap-2',
    lg: 'px-6 py-3 text-lg gap-2.5',
  };

  return (
    <button
      className={`${baseStyles} ${variants[variant]} ${sizes[size]} ${className}`}
      disabled={disabled}
      onClick={onClick}
      {...rest}
    >
      {icon && <span className="flex-shrink-0">{icon}</span>}
      {children}
    </button>
  );
}
