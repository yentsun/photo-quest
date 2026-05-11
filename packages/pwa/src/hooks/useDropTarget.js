import { useRef, useState } from 'react';

/** MIME type carried by drag operations on inventory cards. */
export const DND_TYPE = 'application/x-inventory-id';

/** Drop-target hook for drags that carry an inventory_id. Returns the
 *  highlight flag plus the handlers to spread onto the target element.
 *  Tracks enter/leave depth so nested children don't flicker the highlight. */
export function useDropTarget(onDropId) {
  const [over, setOver] = useState(false);
  const depth = useRef(0);
  const handlers = {
    onDragOver:  (e) => { if (e.dataTransfer.types.includes(DND_TYPE)) e.preventDefault(); },
    onDragEnter: (e) => { if (!e.dataTransfer.types.includes(DND_TYPE)) return; e.preventDefault(); depth.current++; setOver(true); },
    onDragLeave: () => { depth.current--; if (depth.current <= 0) { depth.current = 0; setOver(false); } },
    onDrop:      (e) => {
      e.preventDefault();
      depth.current = 0; setOver(false);
      const id = Number(e.dataTransfer.getData(DND_TYPE));
      if (id) onDropId(id);
    },
  };
  return { over, handlers };
}
