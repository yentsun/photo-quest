import { createContext, useContext, useReducer, useCallback, useRef } from 'react';
import { shuffle } from '../utils/shuffle';

const SlideshowContext = createContext();

const initialState = { active: false, items: [], currentIndex: 0, order: 'random', history: [], total: 0 };

function reducer(state, action) {
  switch (action.type) {
    case 'START':
      return { ...state, active: true, items: action.order === 'random' ? shuffle(action.items) : action.items, currentIndex: action.startIndex || 0, order: action.order || 'random', history: [], total: action.total ?? action.items.length };
    case 'STOP':
      return state.active ? { ...initialState } : state;
    case 'NEXT':
      return { ...state, history: [...state.history, state.currentIndex], currentIndex: (state.currentIndex + 1) % state.items.length };
    case 'PREV':
      if (state.history.length === 0) return state;
      return { ...state, history: state.history.slice(0, -1), currentIndex: state.history[state.history.length - 1] };
    case 'SET_INDEX':
      return { ...state, currentIndex: action.index };
    case 'APPEND_ITEMS': {
      const existingIds = new Set(state.items.map(m => m.id));
      return { ...state, items: [...state.items, ...action.items.filter(m => !existingIds.has(m.id))] };
    }
    case 'REMOVE_ITEM': {
      const removedIdx = state.items.findIndex(m => m.id === action.id);
      const newItems = state.items.filter(m => m.id !== action.id);
      if (newItems.length === 0) return { ...initialState };
      const newHistory = state.history.filter(i => i !== removedIdx).map(i => i > removedIdx ? i - 1 : i);
      return { ...state, items: newItems, currentIndex: Math.min(state.currentIndex, newItems.length - 1), history: newHistory };
    }
    case 'SET_ORDER':
      return { ...state, order: action.order, items: action.order === 'random' ? shuffle(state.items) : [...state.items].sort((a, b) => a.title.localeCompare(b.title)), currentIndex: 0, history: [] };
    default:
      return state;
  }
}

export function SlideshowProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const loadMoreRef = useRef(null);
  return <SlideshowContext.Provider value={{ state, dispatch, loadMoreRef }}>{children}</SlideshowContext.Provider>;
}

export function useSlideshow() {
  const { state, dispatch, loadMoreRef } = useContext(SlideshowContext);
  const start = useCallback((items, opts = {}) => { loadMoreRef.current = opts.loadMore ?? null; dispatch({ type: 'START', items, startIndex: opts.startIndex, order: opts.order || 'random', total: opts.total }); }, [dispatch, loadMoreRef]);
  const stop = useCallback(() => { loadMoreRef.current = null; dispatch({ type: 'STOP' }); }, [dispatch, loadMoreRef]);
  const next = useCallback(() => dispatch({ type: 'NEXT' }), [dispatch]);
  const prev = useCallback(() => dispatch({ type: 'PREV' }), [dispatch]);
  const setIndex = useCallback(i => dispatch({ type: 'SET_INDEX', index: i }), [dispatch]);
  const setOrder = useCallback(o => dispatch({ type: 'SET_ORDER', order: o }), [dispatch]);
  const removeItem = useCallback(id => dispatch({ type: 'REMOVE_ITEM', id }), [dispatch]);
  const loadMore = useCallback(async () => { if (!loadMoreRef.current) return; const items = await loadMoreRef.current(); if (items?.length) dispatch({ type: 'APPEND_ITEMS', items }); }, [dispatch, loadMoreRef]);
  return { active: state.active, items: state.items, currentIndex: state.currentIndex, order: state.order, history: state.history, total: state.total, current: state.items[state.currentIndex] || null, start, stop, next, prev, setIndex, setOrder, removeItem, loadMore };
}

export default SlideshowContext;
