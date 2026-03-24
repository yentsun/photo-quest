/**
 * @file Slideshow state management context.
 * LAW 1.27: slideshow is manual (no auto-advance), uses the unified MediaPage viewer.
 */

import { createContext, useContext, useReducer, useCallback } from 'react';
import { shuffle } from '../utils/shuffle.js';

const SlideshowContext = createContext();

const initialState = {
  active: false,
  items: [],
  currentIndex: 0,
  order: 'random',
  history: [],
};

function reducer(state, action) {
  switch (action.type) {
    case 'START':
      return {
        ...state,
        active: true,
        items: action.order === 'random' ? shuffle(action.items) : action.items,
        currentIndex: action.startIndex || 0,
        order: action.order || 'random',
        history: [],
      };

    case 'STOP':
      return state.active ? { ...initialState } : state;

    case 'NEXT':
      return {
        ...state,
        history: [...state.history, state.currentIndex],
        currentIndex: (state.currentIndex + 1) % state.items.length,
      };

    case 'PREV': {
      if (state.history.length === 0) return state;
      const newHistory = state.history.slice(0, -1);
      return {
        ...state,
        history: newHistory,
        currentIndex: state.history[state.history.length - 1],
      };
    }

    case 'SET_INDEX':
      return { ...state, currentIndex: action.index };

    case 'REMOVE_ITEM': {
      const removedIdx = state.items.findIndex(m => m.id === action.id);
      const newItems = state.items.filter(m => m.id !== action.id);
      if (newItems.length === 0) return { ...initialState };
      /* Remap history indices: drop entries pointing at the removed item,
         shift down entries that pointed after it. */
      const newHistory = state.history
        .filter(i => i !== removedIdx)
        .map(i => i > removedIdx ? i - 1 : i);
      return {
        ...state,
        items: newItems,
        currentIndex: Math.min(state.currentIndex, newItems.length - 1),
        history: newHistory,
      };
    }

    case 'SET_ORDER': {
      const newItems = action.order === 'random'
        ? shuffle(state.items)
        : [...state.items].sort((a, b) => a.title.localeCompare(b.title));
      return {
        ...state,
        order: action.order,
        items: newItems,
        currentIndex: 0,
        history: [],
      };
    }

    default:
      return state;
  }
}

export function SlideshowProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, initialState);

  return (
    <SlideshowContext.Provider value={{ state, dispatch }}>
      {children}
    </SlideshowContext.Provider>
  );
}

export function useSlideshow() {
  const { state, dispatch } = useContext(SlideshowContext);

  const start = useCallback((items, options = {}) => {
    dispatch({
      type: 'START',
      items,
      startIndex: options.startIndex,
      order: options.order || 'random',
    });
  }, [dispatch]);

  const stop = useCallback(() => {
    dispatch({ type: 'STOP' });
  }, [dispatch]);

  const next = useCallback(() => {
    dispatch({ type: 'NEXT' });
  }, [dispatch]);

  const prev = useCallback(() => {
    dispatch({ type: 'PREV' });
  }, [dispatch]);

  const setIndex = useCallback((index) => {
    dispatch({ type: 'SET_INDEX', index });
  }, [dispatch]);

  const removeItem = useCallback((id) => {
    dispatch({ type: 'REMOVE_ITEM', id });
  }, [dispatch]);

  const setOrder = useCallback((order) => {
    dispatch({ type: 'SET_ORDER', order });
  }, [dispatch]);

  const current = state.items[state.currentIndex] || null;

  return {
    active: state.active,
    items: state.items,
    currentIndex: state.currentIndex,
    order: state.order,
    history: state.history,
    current,
    start,
    stop,
    next,
    prev,
    setIndex,
    setOrder,
    removeItem,
  };
}

export default SlideshowContext;
