import React, { useReducer } from 'react';
import { actions } from '@photo-quest/shared';

export const initialState = {
  settings: {},
  errorMessage: null,
  errorStatus: null,
  toastMessage: null,
  toastType: null,
  toastProgress: null,
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
      return { ...state, toastMessage: action.message, toastType: action.toastType || 'info', toastProgress: action.progress ?? null };
    case actions.TOAST_PROGRESS:
      return { ...state, toastMessage: action.message ?? state.toastMessage, toastProgress: action.progress ?? null };
    case actions.TOAST_DISMISSED:
      return { ...state, toastMessage: null, toastType: null, toastProgress: null };
    default:
      throw new Error('unknown action type: ' + action.type);
  }
};

const GlobalContext = React.createContext();

export function GlobalProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  return <GlobalContext.Provider value={{ state, dispatch }}>{children}</GlobalContext.Provider>;
}

export function useGlobal() { return React.useContext(GlobalContext); }

export default GlobalContext;
