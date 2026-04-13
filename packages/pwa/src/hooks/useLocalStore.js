import { useEffect, useState } from 'react';
import { openDb } from '../db/localDb.js';

/**
 * Read all rows from an IndexedDB store. Re-reads whenever `refreshKey`
 * changes — pass `sync.phase` so the list refreshes when sync completes.
 */
export function useLocalStore(store, refreshKey) {
  const [rows, setRows] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const db = await openDb();
      const tx = db.transaction(store, 'readonly');
      const req = tx.objectStore(store).getAll();
      req.onsuccess = () => { if (!cancelled) setRows(req.result || []); };
    })();
    return () => { cancelled = true; };
  }, [store, refreshKey]);

  return rows;
}
