import { useRef, useEffect } from 'react';

export default function Checkbox({
  checked = false,
  indeterminate = false,
  onChange,
  label,
  disabled = false,
  className = '',
  ...rest
}) {
  const ref = useRef(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate;
  }, [indeterminate]);

  return (
    <label className={['checkbox', className].filter(Boolean).join(' ')}>
      <input
        ref={ref}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={onChange}
        {...rest}
      />
      {label && <span className="checkbox-label">{label}</span>}
    </label>
  );
}
