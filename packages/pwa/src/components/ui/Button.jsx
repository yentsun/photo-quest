import './Button.css';

export default function Button({
  variant = 'primary',
  size = 'md',
  children,
  disabled = false,
  className = '',
  onClick,
  ...rest
}) {
  return (
    <button
      className={`btn btn--${variant} btn--${size} ${className}`}
      disabled={disabled}
      onClick={onClick}
      {...rest}
    >
      {children}
    </button>
  );
}
