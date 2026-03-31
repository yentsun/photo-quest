/**
 * @file Global toast notification component.
 *
 * Listens for 'toast' CustomEvents on window. Any component can show a toast:
 *   window.dispatchEvent(new CustomEvent('toast', { detail: { message, type } }))
 *
 * Types: 'info' (blue), 'success' (green), 'error' (red). Defaults to 'info'.
 * Auto-dismisses after toasterTimeout ms.
 */

import { useState, useEffect, useCallback } from 'react';
import { toasterTimeout } from '@photo-quest/shared';
import { IconButton, Icon } from './ui/index.js';

const COLORS = {
  info: 'bg-blue-900 border-blue-700/50 text-blue-200',
  success: 'bg-green-900 border-green-700/50 text-green-200',
  error: 'bg-red-600 border-red-500 text-white',
};

export default function ToasterMessage() {
  const [toast, setToast] = useState(null);

  const dismiss = useCallback(() => setToast(null), []);

  useEffect(() => {
    const onToast = (e) => {
      const { message, type = 'info' } = e.detail;
      setToast({ message, type });
    };
    window.addEventListener('toast', onToast);
    return () => window.removeEventListener('toast', onToast);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(dismiss, toasterTimeout);
    return () => clearTimeout(id);
  }, [toast, dismiss]);

  if (!toast) return null;

  return (
    <div className={`fixed bottom-4 right-4 z-[60] px-4 py-3 rounded-lg shadow-lg border flex items-center gap-3 ${COLORS[toast.type] || COLORS.info}`}>
      <p className="text-sm">{toast.message}</p>
      <IconButton
        icon={<Icon name="close" className="w-4 h-4" />}
        onClick={dismiss}
        label="Dismiss"
        size="sm"
        className="hover:bg-transparent opacity-70 hover:opacity-100"
      />
    </div>
  );
}

/** Helper to dispatch a toast from anywhere. */
export function showToast(message, type = 'info') {
  window.dispatchEvent(new CustomEvent('toast', { detail: { message, type } }));
}
