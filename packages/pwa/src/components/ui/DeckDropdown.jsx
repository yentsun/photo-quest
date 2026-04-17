import { useEffect, useRef, useState } from 'react';
import Button from './Button.jsx';
import { useLocalStore } from '../../hooks/useLocalStore.js';
import { STORES } from '../../db/localDb.js';
import { addToDeck, createDeck } from '../../db/actions.js';

export default function DeckDropdown({ inventoryId, onAdd }) {
  const [open, setOpen] = useState(false);
  const decks = useLocalStore(STORES.DECKS, null) || [];
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  const handle = async (fn) => {
    setOpen(false);
    await fn();
    onAdd?.();
  };

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <Button variant="secondary" onClick={() => setOpen(v => !v)}>+ Deck</Button>
      {open && (
        <div style={{
          position: 'absolute', top: '100%', right: 0, marginTop: '0.25rem',
          background: '#1f2937', border: '1px solid #374151', borderRadius: '0.5rem',
          padding: '0.25rem', minWidth: '10rem', zIndex: 10,
          display: 'flex', flexDirection: 'column', gap: '0.125rem',
        }}>
          {decks.map(d => (
            <Button key={d.id} variant="ghost" onClick={() => handle(() => addToDeck(d.id, inventoryId))}>
              {d.name || 'Untitled deck'}
            </Button>
          ))}
          <Button variant="ghost" onClick={() => handle(async () => {
            const created = await createDeck('New deck', [inventoryId]);
            if (!created?.__queued && !created?.id) return;
          })}>+ New deck</Button>
        </div>
      )}
    </div>
  );
}
