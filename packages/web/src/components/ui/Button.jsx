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
  const variantClass = variant === 'primary' ? 'btn-primary'
    : variant === 'ghost' ? 'btn-ghost'
    : variant === 'danger' ? 'btn-danger'
    : variant === 'text' ? 'btn-text'
    : '';

  const sizeClass = size === 'sm' ? 'btn-sm' : size === 'lg' ? 'btn-lg' : '';

  return (
    <button
      className={['btn', variantClass, sizeClass, className].filter(Boolean).join(' ')}
      disabled={disabled}
      onClick={onClick}
      {...rest}
    >
      {icon && icon}
      {children}
    </button>
  );
}
