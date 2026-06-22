/**
 * @file Styled text input component.
 */

import { forwardRef } from 'react';

/**
 * @param {Object} props
 * @param {'default' | 'success' | 'error'} [props.variant] - Visual state
 */
const Input = forwardRef(function Input({ variant = 'default', className = '', ...rest }, ref) {
  const borders = {
    default: 'border-gray-600',
    success: 'border-green-500',
    error: 'border-red-500',
  };

  return (
    <input
      ref={ref}
      className={`w-full px-3 py-2 bg-gray-700 border ${borders[variant]} rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-blue-500 ${className}`}
      {...rest}
    />
  );
});

export default Input;
