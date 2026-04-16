import { useEffect, useState } from 'react';
import { tx, req } from '../db/localDb.js';
import { onMutation } from '../db/events.js';

/**
 * Read all rows from an IndexedDB store. Re-reads automatically on any
 * IDB change — local actions call `emitMutation` after commit, and the
 * sync bridge fires it on worker 'done'/'change' messages.
 */
export function useLocalStore(store) {
  const [rows, setRows] = useState(null);

  useEffect(() => {
    let cancelled = false;
    const read = async () => {
      const result = await tx(store, 'readonly', (t) => req(t.objectStore(store).getAll()));
      console.debug('[useLocalStore] read', store, '→', result?.length, 'rows', { cancelled });
      if (!cancelled) setRows(result);
    };
    read();
    const unsub = onMutation(read);
    return () => { cancelled = true; unsub(); };
  }, [store]);

  return rows;
}
