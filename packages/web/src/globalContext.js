/**
 * @file Global application state management via React Context + useReducer.
 *
 * Instead of pulling in a full state-management library (Redux, Zustand, etc.)
 * we use React's built-in Context API together with a useReducer hook.  This
 * keeps the dependency footprint small while still providing a predictable,
 * Flux-style state container that any component in the tree can read from or
 * dispatch actions to.
 *
 * How it works:
 *  1. The Router component calls `useReducer(reducer, initialState)`.
 *  2. It wraps the entire app in `<GlobalContext.Provider value={{ state, dispatch }}>`.
 *  3. Any child component can call `useContext(GlobalContext)` to access
 *     the current state or dispatch an action.
 */

import React from 'react';
import { actions } from '@photo-quest/shared';

// ---------------------------------------------------------------------------
// Initial state
// ---------------------------------------------------------------------------

/**
 * The starting state of the global store, used as the second argument to
 * `useReducer`.
 *
 * @type {{
 *   settings: Object,
 *   errorMessage: string | null,
 *   errorStatus: number | null
 * }}
 */
export const initialState = {
  /** User-specific settings loaded from the server or localStorage. */
  settings: {},

  /** The text shown in the toaster notification, or null if no error is
   *  currently displayed. */
  errorMessage: null,

  /** The HTTP status code associated with the current error (e.g. 500), or
   *  null.  Used to decide whether to prefix the toaster with "Server Error". */
  errorStatus: null,

  /** List of all media items from the server. */
  media: [],

  /** Whether media is currently being loaded. */
  mediaLoading: true,

  /** Unique folder paths derived from media. */
  folders: [],
};

// ---------------------------------------------------------------------------
// Reducer
// ---------------------------------------------------------------------------

/**
 * Pure reducer function that produces the next state given an action.
 *
 * @param {typeof initialState} state  - The current global state.
 * @param {{ type: string, [key: string]: any }} action - A dispatched action
 *   whose `type` field must match one of the values in the `actions` enum.
 * @returns {typeof initialState} The next state (a new object -- never mutated).
 * @throws {Error} If the action type is not recognised, which signals a
 *   programming error somewhere in the app.
 */
export const reducer = (state, action) => {
  switch (action.type) {
    /*
     * SETTINGS_LOADED is dispatched once, right after the app fetches the
     * user's settings from the back-end.  It flips `settingsLoaded` to true
     * (which downstream components can use to show a loading spinner until
     * that flag is set) and stores both the user ID and the settings object.
     */
    case actions.SETTINGS_LOADED:
      return {
        ...state,
        settingsLoaded: true,
        selfId: action.selfId,
        settings: action.settings
      };

    /*
     * SETTING_UPDATED is dispatched when the user changes an individual
     * setting.  The payload's `setting` field is a partial object that gets
     * shallow-merged into the existing settings map.
     */
    case actions.SETTING_UPDATED:
      return {
        ...state,
        settings: { ...state.settings, ...action.setting }
      };

    /*
     * ERROR_DISMISSED clears the error toaster.  Dispatched either when the
     * user clicks the dismiss button or when the auto-dismiss timeout fires.
     */
    case actions.ERROR_DISMISSED:
      return {
        ...state,
        errorMessage: null,
        errorStatus: null
      };

    /*
     * MEDIA_LOADED is dispatched when the media list is fetched from server.
     * Derives unique folders from media paths.
     */
    case actions.MEDIA_LOADED: {
      const folders = [...new Set(action.media.map(m => m.folder).filter(Boolean))];
      return {
        ...state,
        media: action.media,
        mediaLoading: false,
        folders,
      };
    }

    /*
     * MEDIA_LIKED is dispatched when a media item is liked.
     * Updates the like count for the specific media item.
     */
    case actions.MEDIA_LIKED:
      return {
        ...state,
        media: state.media.map(m =>
          m.id === action.mediaId
            ? { ...m, likes: (m.likes || 0) + 1 }
            : m
        ),
      };

    /*
     * MEDIA_ADDED is dispatched when new media items are added from a folder scan.
     * Appends new items to the media list and updates folders.
     */
    case actions.MEDIA_ADDED: {
      const newMedia = [...state.media, ...action.media];
      const folders = [...new Set(newMedia.map(m => m.folder).filter(Boolean))];
      return {
        ...state,
        media: newMedia,
        folders,
      };
    }

    default:
      throw new Error('unknown action type: ' + action.type);
  }
};

// ---------------------------------------------------------------------------
// Context object
// ---------------------------------------------------------------------------

/**
 * The React Context that carries `{ state, dispatch }` down the component
 * tree.  Components consume it via `useContext(GlobalContext)`.
 *
 * Created with no default value -- if a component tries to read the context
 * outside of a Provider, it will get `undefined`, which is intentional
 * because every render path should go through the Provider in Router.jsx.
 */
const GlobalContext = React.createContext();

export default GlobalContext;
