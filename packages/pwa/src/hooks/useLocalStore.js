import { useEffect, useState } from 'react';
import { openDb } from '../db/localDb.js';
import { onMutation } from '../db/events.js';

/**
 * Read all rows from an IndexedDB store. Re-reads on every mutation
 * (optimistic writes + server-push SSE both fire `emitMutation`) and
 * when the caller bumps `refreshKey`.
 */
export function useLocalStore(store, refreshKey) {
  const [rows, setRows] = useState(null);

  useEffect(() => {
    let cancelled = false;
    const read = async () => {
      const db = await openDb();
      const tx = db.transaction(store, 'readonly');
      const r  = tx.objectStore(store).getAll();
      r.onsuccess = () => { if (!cancelled) setRows(r.result || []); };
    };
    read();
    const off = onMutation(read);
    return () => { cancelled = true; off(); };
  }, [store, refreshKey]);

  return rows;
}
