/**
 * @file Global application state management via React Context + useReducer.
 *
 * Holds only truly global state (settings, errors). Media data is fetched
 * per-page via the refresh signal pattern.
 */

import React from 'react';
import { actions } from '@photo-quest/shared';

// ---------------------------------------------------------------------------
// Initial state
// ---------------------------------------------------------------------------

export const initialState = {
  settings: {},
  errorMessage: null,
  errorStatus: null,
};

// ---------------------------------------------------------------------------
// Reducer
// ---------------------------------------------------------------------------

export const reducer = (state, action) => {
  switch (action.type) {
    case actions.SETTINGS_LOADED:
      return {
        ...state,
        settingsLoaded: true,
        selfId: action.selfId,
        settings: action.settings
      };

    case actions.SETTING_UPDATED:
      return {
        ...state,
        settings: { ...state.settings, ...action.setting }
      };

    case actions.ERROR_DISMISSED:
      return {
        ...state,
        errorMessage: null,
        errorStatus: null
      };

    default:
      throw new Error('unknown action type: ' + action.type);
  }
};

// ---------------------------------------------------------------------------
// Context object
// ---------------------------------------------------------------------------

const GlobalContext = React.createContext();

export default GlobalContext;
