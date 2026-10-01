import { useEffect, useCallback } from 'react';
import Icon from './Icon.jsx';
import IconButton from './IconButton.jsx';

export default function Modal({
  open,
  onClose,
  onConfirm,
  title,
  children,
  className = '',
  closable = true,
}) {
  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Escape' && closable) { onClose(); return; }
    if (e.key === 'Enter' && onConfirm) {
      /* A focused control inside the modal handles Enter natively (e.g. the
         Cancel button, or a text field), so defer to it. A non-interactive key
         target (usually <body>, when nothing in the modal is focused) confirms
         the modal's primary action. */
      const target = e.target instanceof Element ? e.target : null;
      if (target && target.closest('button, a, input, textarea, select') && target.closest('[role="dialog"]')) return;
      e.preventDefault();
      onConfirm();
    }
  }, [onClose, closable, onConfirm]);

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
        role="dialog"
        aria-modal="true"
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
