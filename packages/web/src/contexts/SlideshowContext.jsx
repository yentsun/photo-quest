/**
 * @file Slideshow state management context.
 */

import { createContext, useContext, useReducer, useCallback } from 'react';
import { slideshowInterval } from '@photo-quest/shared';
import { shuffle } from '../utils/shuffle.js';

const SlideshowContext = createContext();

const initialState = {
  active: false,
  items: [],
  currentIndex: 0,
  playing: false,
  order: 'random', // 'random' | 'sequential'
  interval: slideshowInterval,
};

function reducer(state, action) {
  switch (action.type) {
    case 'START':
      return {
        ...state,
        active: true,
        items: action.order === 'random' ? shuffle(action.items) : action.items,
        currentIndex: action.startIndex || 0,
        playing: true,
        order: action.order || 'random',
      };

    case 'OPEN':
      return {
        ...state,
        active: true,
        items: action.items,
        currentIndex: action.startIndex || 0,
        playing: false,
        order: 'sequential',
      };

    case 'STOP':
      return {
        ...state,
        active: false,
        items: [],
        currentIndex: 0,
        playing: false,
      };

    case 'NEXT':
      return {
        ...state,
        currentIndex: (state.currentIndex + 1) % state.items.length,
      };

    case 'PREV':
      return {
        ...state,
        currentIndex: state.currentIndex === 0
          ? state.items.length - 1
          : state.currentIndex - 1,
      };

    case 'TOGGLE_PLAY':
      return {
        ...state,
        playing: !state.playing,
      };

    case 'SET_ORDER': {
      const newItems = action.order === 'random'
        ? shuffle(state.items)
        : [...state.items].sort((a, b) => a.title.localeCompare(b.title));
      return {
        ...state,
        order: action.order,
        items: newItems,
        currentIndex: 0,
      };
    }

    case 'UPDATE_ITEM':
      return {
        ...state,
        items: state.items.map(item =>
          item.id === action.itemId
            ? { ...item, ...action.updates }
            : item
        ),
      };

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

/**
 * Hook for accessing slideshow state and controls.
 */
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

  const open = useCallback((items, index = 0) => {
    dispatch({
      type: 'OPEN',
      items,
      startIndex: index,
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

  const togglePlay = useCallback(() => {
    dispatch({ type: 'TOGGLE_PLAY' });
  }, [dispatch]);

  const setOrder = useCallback((order) => {
    dispatch({ type: 'SET_ORDER', order });
  }, [dispatch]);

  const updateItem = useCallback((itemId, updates) => {
    dispatch({ type: 'UPDATE_ITEM', itemId, updates });
  }, [dispatch]);

  const current = state.items[state.currentIndex] || null;

  return {
    active: state.active,
    items: state.items,
    currentIndex: state.currentIndex,
    playing: state.playing,
    order: state.order,
    interval: state.interval,
    current,
    start,
    open,
    stop,
    next,
    prev,
    togglePlay,
    setOrder,
    updateItem,
  };
}

export default SlideshowContext;
