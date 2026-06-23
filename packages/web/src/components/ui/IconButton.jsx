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
  const variantClass = variant === 'overlay' ? 'icon-btn-overlay' : '';
  const sizeClass = size === 'sm' ? 'icon-btn-sm' : size === 'lg' ? 'icon-btn-lg' : '';

  return (
    <button
      className={['icon-btn', variantClass, sizeClass, className].filter(Boolean).join(' ')}
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
