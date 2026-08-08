import { createContext, useContext, useReducer, type ReactNode } from 'react';
import { actions } from '@photo-quest/shared';

interface State {
  settings: Record<string, unknown>;
  errorMessage: string | null;
  errorStatus: number | null;
  toastMessage: string | null;
  toastType: string | null;
}

const initialState: State = {
  settings: {},
  errorMessage: null,
  errorStatus: null,
  toastMessage: null,
  toastType: null,
};

type Action =
  | { type: typeof actions.SETTINGS_LOADED; selfId: string; settings: Record<string, unknown> }
  | { type: typeof actions.SETTING_UPDATED; setting: Record<string, unknown> }
  | { type: typeof actions.ERROR_DISMISSED }
  | { type: typeof actions.TOAST_SHOWN; message: string; toastType?: string }
  | { type: typeof actions.TOAST_DISMISSED };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case actions.SETTINGS_LOADED:
      return { ...state, settings: action.settings };
    case actions.SETTING_UPDATED:
      return { ...state, settings: { ...state.settings, ...action.setting } };
    case actions.ERROR_DISMISSED:
      return { ...state, errorMessage: null, errorStatus: null };
    case actions.TOAST_SHOWN:
      return { ...state, toastMessage: action.message, toastType: action.toastType || 'info' };
    case actions.TOAST_DISMISSED:
      return { ...state, toastMessage: null, toastType: null };
    default:
      return state;
  }
}

const GlobalCtx = createContext<{ state: State; dispatch: React.Dispatch<Action> } | null>(null);

export function GlobalProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  return <GlobalCtx.Provider value={{ state, dispatch }}>{children}</GlobalCtx.Provider>;
}

export function useGlobal() {
  const ctx = useContext(GlobalCtx);
  if (!ctx) throw new Error('useGlobal must be used within GlobalProvider');
  return ctx;
}
