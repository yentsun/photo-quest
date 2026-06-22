/**
 * @file Modal overlay component.
 */

import { useEffect, useCallback } from 'react';
import Icon from './Icon.jsx';
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
 * @param {boolean} [props.closable=true] - Whether the modal can be closed
 */
export default function Modal({
  open,
  onClose,
  title,
  children,
  className = '',
  closable = true,
}) {
  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Escape' && closable) {
      onClose();
    }
  }, [onClose, closable]);

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
        onClick={closable ? onClose : undefined}
      />

      {/* Modal content */}
      <div className={`relative bg-gray-800 rounded-lg shadow-xl max-w-lg w-full mx-4 max-h-[90vh] overflow-auto ${className}`}>
        {title && (
          <div className="flex items-center justify-between p-4 border-b border-gray-700">
            <h2 className="text-lg font-semibold text-white">{title}</h2>
            {closable && (
              <IconButton
                icon={<Icon name="close" />}
                onClick={onClose}
                label="Close modal"
                className="text-gray-400 hover:text-white"
              />
            )}
          </div>
        )}
        <div className="p-4">
          {children}
        </div>
      </div>
    </div>
  );
}
