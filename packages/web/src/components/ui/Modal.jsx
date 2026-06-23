import { useEffect, useCallback } from 'react';
import Icon from './Icon.jsx';
import IconButton from './IconButton.jsx';

export default function Modal({
  open,
  onClose,
  title,
  children,
  className = '',
  closable = true,
}) {
  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Escape' && closable) onClose();
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
    <div
      className="modal-scrim"
      onClick={closable ? onClose : undefined}
    >
      <div
        className={['modal', className].filter(Boolean).join(' ')}
        onClick={e => e.stopPropagation()}
      >
        {title && (
          <div className="modal-titlebar">
            <h2>{title}</h2>
            {closable && (
              <IconButton
                icon={<Icon name="close" className="icon-sm" />}
                onClick={onClose}
                label="Close modal"
              />
            )}
          </div>
        )}
        <div className="modal-body">
          {children}
        </div>
      </div>
    </div>
  );
}
