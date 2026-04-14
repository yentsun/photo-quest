/**
 * @file Dropdown to move a card to a user deck. Used in large card actions.
 */

import { useState, useEffect, useRef } from 'react';
import { useDecks } from '../../db/hooks.js';
import { addToDeck } from '../../db/actions.js';
import { showToast } from '../ToasterMessage.jsx';
import IconButton from './IconButton.jsx';
import Icon from './Icon.jsx';

export default function DeckDropdown({ inventoryId, onAdd }) {
  const [open, setOpen] = useState(false);
  const { decks } = useDecks();
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  const handleAdd = async (deckId, deckName) => {
    try {
      await addToDeck(deckId, [inventoryId]);
      showToast(`Added to ${deckName}`);
      if (onAdd) onAdd();
    } catch {
      showToast('Failed to add to deck', 'error');
    }
    setOpen(false);
  };

  return (
    <div className="relative" ref={ref}>
      <IconButton
        icon={<Icon name="deck" className="w-5 h-5" />}
        label="Move to deck"
        onClick={() => setOpen(!open)}
        className="bg-gray-700/80 hover:bg-gray-600 text-gray-200 hover:text-white rounded-full p-2"
      />
      {open && (
        <div className="absolute left-full top-0 ml-2 bg-gray-800 border border-gray-600 rounded-lg shadow-xl min-w-[10rem] py-1 z-10">
          {decks.length === 0 && (
            <p className="px-3 py-2 text-gray-400 text-xs">No decks</p>
          )}
          {decks.map(d => (
            <button
              key={d.id}
              onClick={() => handleAdd(d.id, d.name)}
              className="w-full text-left px-3 py-1.5 text-sm text-gray-200 hover:bg-gray-700 truncate"
            >
              {d.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
