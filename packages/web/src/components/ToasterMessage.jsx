import React, { useContext, useEffect } from 'react';
import GlobalContext from '../globalContext';
import { actions, toasterTimeout } from '@photo-quest/shared';
import { Icon, IconButton } from './ui/index.js';

export default function ToasterMessage() {
  const { dispatch, state: { errorMessage, errorStatus, toastMessage, toastType } } = useContext(GlobalContext);

  const message = toastMessage || errorMessage;
  const type = toastType || (errorStatus === 500 ? 'error' : 'info');

  useEffect(() => {
    if (!message) return;
    const timeoutId = setTimeout(
      () => dispatch({ type: toastMessage ? actions.TOAST_DISMISSED : actions.ERROR_DISMISSED }),
      toasterTimeout
    );
    return () => clearTimeout(timeoutId);
  }, [message, toastMessage, dispatch]);

  if (!message || message === 'Unauthorized') return null;

  return (
    <div className={`toaster toaster-${type}`}>
      <p>
        {errorStatus === 500 && !toastMessage ? 'Server Error: ' : ''}
        {message}
      </p>
      <IconButton
        icon={<Icon name="close" className="icon-sm" />}
        onClick={() => dispatch({ type: toastMessage ? actions.TOAST_DISMISSED : actions.ERROR_DISMISSED })}
        label="Dismiss message"
        size="sm"
        className="icon-btn-overlay"
      />
    </div>
  );
}
