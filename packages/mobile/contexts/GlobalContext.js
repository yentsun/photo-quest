import React from 'react';
import { actions } from '@photo-quest/shared';

export const initialState = {
  settings: {},
  errorMessage: null,
  errorStatus: null,
  toastMessage: null,
  toastType: null,
};

export const reducer = (state, action) => {
  switch (action.type) {
    case actions.SETTINGS_LOADED:
      return { ...state, settingsLoaded: true, selfId: action.selfId, settings: action.settings };
    case actions.SETTING_UPDATED:
      return { ...state, settings: { ...state.settings, ...action.setting } };
    case actions.ERROR_DISMISSED:
      return { ...state, errorMessage: null, errorStatus: null };
    case actions.TOAST_SHOWN:
      return { ...state, toastMessage: action.message, toastType: action.toastType || 'info' };
    case actions.TOAST_DISMISSED:
      return { ...state, toastMessage: null, toastType: null };
    default:
      throw new Error('unknown action type: ' + action.type);
  }
};

const GlobalContext = React.createContext();
export default GlobalContext;
