/**
 * @file Confirmation modal for destructive/important actions.
 */

import Modal from './Modal.jsx';
import Button from './Button.jsx';

export default function ConfirmModal({ action, onCancel }) {
  if (!action) return null;

  return (
    <Modal open onClose={onCancel}>
      <div className="text-center space-y-3">
        <p className="text-white text-lg">{action.message}</p>
        {action.reward && <p className="text-purple-300 font-semibold">{action.reward}</p>}
        <div className="flex gap-3 justify-center pt-2">
          <Button
            onClick={action.onConfirm}
            className={action.destructive ? 'bg-red-700 hover:bg-red-600' : ''}
          >
            {action.confirmLabel}
          </Button>
          <Button variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </div>
    </Modal>
  );
}
