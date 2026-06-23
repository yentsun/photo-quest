import { forwardRef } from 'react';

const Input = forwardRef(function Input({ variant = 'default', className = '', ...rest }, ref) {
  const variantClass = variant === 'success' ? 'input-success'
    : variant === 'error' ? 'input-error'
    : '';
  return (
    <input
      ref={ref}
      className={['input', variantClass, className].filter(Boolean).join(' ')}
      {...rest}
    />
  );
});

export default Input;
