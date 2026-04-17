import { useEffect } from 'react';

/**
 * Document-level keydown listener. Skips events whose target is an
 * <input>/<textarea>/contenteditable so dialogs that contain form fields
 * don't hijack typing. `handler` is called with the original event.
 *
 * @param {(e: KeyboardEvent) => void} handler
 * @param {boolean} [active=true] Conditionally bind — e.g. only while a
 *   modal is open.
 * @param {any[]} [deps=[]] Extra deps that should re-bind the listener,
 *   same semantics as useEffect's dep array.
 */
export function useKeydown(handler, active = true, deps = []) {
  useEffect(() => {
    if (!active) return;
    const onKey = (e) => {
      const tag = e.target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.target?.isContentEditable) return;
      handler(e);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, ...deps]);
}
