import React, { useContext, useEffect } from 'react';
import GlobalContext from '../globalContext';
import { actions, toasterTimeout } from '@photo-quest/shared';
import { Icon, IconButton } from './ui/index.js';

export default function ToasterMessage() {
  const { dispatch, state: { errorMessage, errorStatus } } = useContext(GlobalContext);

  useEffect(() => {
    if (!errorMessage) return;
    const timeoutId = setTimeout(
      () => dispatch({ type: actions.ERROR_DISMISSED }),
      toasterTimeout
    );
    return () => clearTimeout(timeoutId);
  }, [errorMessage, dispatch]);

  if (!errorMessage || errorMessage === 'Unauthorized') return null;

  return (
    <div className="toaster">
      <p>
        {errorStatus === 500 ? 'Server Error: ' : ''}
        {errorMessage}
      </p>
      <IconButton
        icon={<Icon name="close" className="icon-sm" />}
        onClick={() => dispatch({ type: actions.ERROR_DISMISSED })}
        label="Dismiss message"
        size="sm"
        className="icon-btn-overlay"
      />
    </div>
  );
}
