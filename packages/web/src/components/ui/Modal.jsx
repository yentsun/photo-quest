/**
 * @file Modal overlay component.
 */

import { useEffect, useCallback } from 'react';
import IconButton from './IconButton.jsx';

/**
 * Modal dialog with backdrop and close functionality.
 *
 * @param {Object} props
 * @param {boolean} props.open - Whether modal is visible
 * @param {Function} props.onClose - Handler called when modal should close
 * @param {string} [props.title] - Optional modal title
 * @param {React.ReactNode} props.children - Modal content
 * @param {string} [props.className] - Additional CSS classes for modal body
 */
export default function Modal({
  open,
  onClose,
  title,
  children,
  className = '',
}) {
  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Escape') {
      onClose();
    }
  }, [onClose]);

  useEffect(() => {
    if (open) {
      document.addEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [open, handleKeyDown]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70"
        onClick={onClose}
      />

      {/* Modal content */}
      <div className={`relative bg-gray-800 rounded-lg shadow-xl max-w-lg w-full mx-4 max-h-[90vh] overflow-auto ${className}`}>
        {title && (
          <div className="flex items-center justify-between p-4 border-b border-gray-700">
            <h2 className="text-lg font-semibold text-white">{title}</h2>
            <IconButton
              icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>}
              onClick={onClose}
              label="Close modal"
              className="text-gray-400 hover:text-white"
            />
          </div>
        )}
        <div className="p-4">
          {children}
        </div>
      </div>
    </div>
  );
}
