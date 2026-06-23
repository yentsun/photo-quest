export default function Spinner({ size = 'md', className = '' }) {
  const sizeClass = size === 'sm' ? 'spinner-sm' : size === 'lg' ? 'spinner-lg' : '';
  return (
    <div
      className={['spinner', sizeClass, className].filter(Boolean).join(' ')}
      role="status"
      aria-label="Loading"
    />
  );
}
