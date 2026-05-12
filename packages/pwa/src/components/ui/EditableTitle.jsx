import { useState } from 'react';
import Input from './Input.jsx';
import './EditableTitle.css';

/* Click the title to edit it inline. Stops click propagation so it
 * doesn't fire ancestor handlers (e.g. opening the card it sits in). */
export default function EditableTitle({
  value, onSave, as: Tag = 'span', className, placeholder = 'Untitled',
}) {
  const [draft, setDraft] = useState(null);
  const editing = draft !== null;

  const startEdit = (e) => {
    e.stopPropagation();
    setDraft(value || '');
  };

  const save = () => {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== value) onSave(trimmed);
    setDraft(null);
  };

  if (editing) {
    return (
      <Input
        value={draft}
        autoFocus
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === 'Enter')  save();
          if (e.key === 'Escape') setDraft(null);
        }}
      />
    );
  }

  return (
    <Tag className={`editable-title ${className || ''}`} onClick={startEdit}>
      {value || placeholder}
    </Tag>
  );
}
