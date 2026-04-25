import { useKeydown } from '../../hooks/useKeydown.js';
import './Modal.css';

export default function Modal({ open, title, onClose, children }) {
  useKeydown((e) => { if (e.key === 'Escape') onClose(); }, open, [onClose]);

  if (!open) return null;

  return (
    <div className="modal__backdrop" onClick={onClose}>
      <div className="modal__panel" onClick={(e) => e.stopPropagation()}>
        <header className="modal__header">
          <h2 className="modal__title">{title}</h2>
          <button className="modal__close" onClick={onClose} aria-label="Close">×</button>
        </header>
        <div className="modal__body">{children}</div>
      </div>
    </div>
  );
}
