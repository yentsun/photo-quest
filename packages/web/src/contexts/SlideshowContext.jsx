/**
 * @file Slideshow state management context.
 * LAW 1.27: slideshow is manual (no auto-advance), uses the unified MediaPage viewer.
 */

import { createContext, useContext, useReducer, useCallback, useRef } from 'react';
import { shuffle } from '../utils/shuffle.js';

const SlideshowContext = createContext();

const initialState = {
  active: false,
  items: [],
  currentIndex: 0,
  order: 'random',
  history: [],
  total: 0, // total items available in the source (may exceed items.length for lazy loading)
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
        total: action.total ?? action.items.length,
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

    /* Append a new page of items, deduplicating by id. */
    case 'APPEND_ITEMS': {
      const existingIds = new Set(state.items.map(m => m.id));
      const fresh = action.items.filter(m => !existingIds.has(m.id));
      return { ...state, items: [...state.items, ...fresh] };
    }

    case 'REMOVE_ITEM': {
      const removedIdx = state.items.findIndex(m => m.id === action.id);
      const newItems = state.items.filter(m => m.id !== action.id);
      if (newItems.length === 0) return { ...initialState };
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
  /* loadMoreRef holds an async fn () => Item[] set by whoever starts the slideshow.
     Stored in a ref so it never triggers re-renders or effect re-runs. */
  const loadMoreRef = useRef(null);

  return (
    <SlideshowContext.Provider value={{ state, dispatch, loadMoreRef }}>
      {children}
    </SlideshowContext.Provider>
  );
}

export function useSlideshow() {
  const { state, dispatch, loadMoreRef } = useContext(SlideshowContext);

  const start = useCallback((items, options = {}) => {
    loadMoreRef.current = options.loadMore ?? null;
    dispatch({
      type: 'START',
      items,
      startIndex: options.startIndex,
      order: options.order || 'random',
      total: options.total,
    });
  }, [dispatch, loadMoreRef]);

  const stop = useCallback(() => {
    loadMoreRef.current = null;
    dispatch({ type: 'STOP' });
  }, [dispatch, loadMoreRef]);

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

  /** Fetch the next page and append it to the slideshow. No-op if no loader set. */
  const loadMore = useCallback(async () => {
    if (!loadMoreRef.current) return;
    const items = await loadMoreRef.current();
    if (items?.length) dispatch({ type: 'APPEND_ITEMS', items });
  }, [dispatch, loadMoreRef]);

  const current = state.items[state.currentIndex] || null;

  return {
    active: state.active,
    items: state.items,
    currentIndex: state.currentIndex,
    order: state.order,
    history: state.history,
    total: state.total,
    current,
    start,
    stop,
    next,
    prev,
    setIndex,
    setOrder,
    removeItem,
    loadMore,
  };
}

export default SlideshowContext;
