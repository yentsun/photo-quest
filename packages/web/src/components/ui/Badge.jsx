export default function Badge({ count, variant = 'default', className = '' }) {
  const variantClass = variant === 'primary' ? 'badge-primary'
    : variant === 'success' ? 'badge-success'
    : variant === 'warning' ? 'badge-warning'
    : variant === 'error' ? 'badge-error'
    : '';

  return (
    <span className={['badge', variantClass, className].filter(Boolean).join(' ')}>
      {count}
    </span>
  );
}
