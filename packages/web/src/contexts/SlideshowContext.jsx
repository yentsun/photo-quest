/**
 * @file Slideshow state management context.
 * LAW 1.27: slideshow is manual (no auto-advance), uses the unified MediaPage viewer.
 *
 * Persistence: the active slideshow session (order, sequence, current index,
 * history, total, and the fetch source) is written to sessionStorage so it
 * survives a full page reload. Mobile browsers reload background tabs on
 * wake — without this, a shuffle session is silently reset back to folder
 * mode. sessionStorage is scoped to the tab, so an old slideshow never leaks
 * into a freshly opened tab, and is cleared as soon as the slideshow stops.
 */

import { createContext, useContext, useReducer, useCallback, useRef, useEffect } from 'react';
import { shuffle } from '../utils/shuffle.js';
import { fetchMedia } from '../utils/api.js';

const SlideshowContext = createContext();

const STORAGE_KEY = 'photoquest.slideshow.session';

const initialState = {
  active: false,
  items: [],
  currentIndex: 0,
  order: 'random',
  history: [],
  total: 0, // total items available in the source (may exceed items.length for lazy loading)
  /* Serializable description of how the session was started so `loadMore`
     can be rebuilt after a reload (the in-memory `loadMoreRef` closure is
     lost). `{ query }` is spread into fetchMedia, minus the pagination fields. */
  source: null,
};

/**
 * Restore a previously saved slideshow snapshot, sanitising values so an
 * out-of-date or corrupt snapshot can never produce indexes out of bounds.
 */
function loadSnapshot() {
  let raw;
  try {
    raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return initialState;
  } catch {
    return initialState;
  }
  try {
    const data = JSON.parse(raw);
    const items = Array.isArray(data?.items) ? data.items : [];
    if (!data?.active || items.length === 0) return initialState;
    const maxIndex = items.length - 1;
    const history = Array.isArray(data.history)
      ? data.history.filter((i) => Number.isInteger(i) && i >= 0 && i <= maxIndex)
      : [];
    return {
      active: true,
      items,
      currentIndex: Math.min(Math.max(0, Number(data.currentIndex) || 0), maxIndex),
      order: data.order || 'random',
      history,
      total: Number(data.total) || items.length,
      source: data.source || null,
    };
  } catch {
    return initialState;
  }
}

function saveSnapshot(state) {
  try {
    sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        active: state.active,
        items: state.items,
        currentIndex: state.currentIndex,
        order: state.order,
        history: state.history,
        total: state.total,
        source: state.source,
      }),
    );
  } catch {
    /* Ignore quota / private-mode errors — persistence is best-effort. */
  }
}

/** Rebuild the pagination loader from a persisted `source` descriptor. */
function buildLoadMoreFromSource(source) {
  if (!source?.query || typeof source.query !== 'object') return null;
  const BATCH = 500;
  return async () => {
    const res = await fetchMedia({ ...source.query, random: true, limit: BATCH });
    return res.items;
  };
}

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
        source: action.source ?? null,
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
  const [state, dispatch] = useReducer(reducer, undefined, loadSnapshot);
  /* loadMoreRef holds an async fn () => Item[] set by whoever starts the slideshow.
     Stored in a ref so it never triggers re-renders or effect re-runs. It is reset
     on a full page reload, so `loadMore` falls back to rebuilding from `state.source`. */
  const loadMoreRef = useRef(null);

  /* Keep the session snapshot in sync. When a slideshow is actively playing this
     restores it after a reload; once it stops we clear the snapshot so a stale
     session is never resurrected. */
  useEffect(() => {
    try {
      if (state.active) saveSnapshot(state);
      else sessionStorage.removeItem(STORAGE_KEY);
    } catch { /* ignore */ }
  }, [state]);

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
      source: options.source ?? null,
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

  /** Fetch the next page and append it to the slideshow. After a reload the
      in-memory loader is gone, so rebuild it from the persisted source. */
  const loadMore = useCallback(async () => {
    const loader = loadMoreRef.current ?? buildLoadMoreFromSource(state.source);
    if (!loader) return;
    const items = await loader();
    if (items?.length) dispatch({ type: 'APPEND_ITEMS', items });
  }, [dispatch, loadMoreRef, state.source]);

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
