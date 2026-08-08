import { createContext, useContext, useReducer, useCallback, type ReactNode } from 'react';

interface SlideshowState {
  isActive: boolean;
  items: unknown[];
  currentIndex: number;
  order: string;
  history: number[];
  total: number;
}

type SlideshowAction =
  | { type: 'START'; items: unknown[]; index: number; total: number; order: string }
  | { type: 'STOP' }
  | { type: 'NEXT' }
  | { type: 'PREV' }
  | { type: 'LOAD_MORE'; items: unknown[]; total: number };

const initialState: SlideshowState = {
  isActive: false,
  items: [],
  currentIndex: 0,
  order: 'random',
  history: [],
  total: 0,
};

function reducer(state: SlideshowState, action: SlideshowAction): SlideshowState {
  switch (action.type) {
    case 'START':
      return { ...state, isActive: true, items: action.items, currentIndex: action.index, total: action.total, order: action.order, history: [action.index] };
    case 'STOP':
      return initialState;
    case 'NEXT': {
      const nextIndex = (state.currentIndex + 1) % state.items.length;
      return { ...state, currentIndex: nextIndex, history: [...state.history, nextIndex] };
    }
    case 'PREV': {
      const history = [...state.history];
      history.pop();
      return { ...state, currentIndex: history.at(-1) ?? 0, history };
    }
    case 'LOAD_MORE':
      return { ...state, items: [...state.items, ...action.items], total: action.total };
    default:
      return state;
  }
}

const SlideshowCtx = createContext<{
  state: SlideshowState;
  start: (items: unknown[], index: number, total: number, order: string) => void;
  stop: () => void;
  next: () => void;
  prev: () => void;
  loadMore: (items: unknown[], total: number) => void;
} | null>(null);

export function SlideshowProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);

  const start = useCallback((items: unknown[], index: number, total: number, order: string) => {
    dispatch({ type: 'START', items, index, total, order });
  }, []);

  const stop = useCallback(() => dispatch({ type: 'STOP' }), []);
  const next = useCallback(() => dispatch({ type: 'NEXT' }), []);
  const prev = useCallback(() => dispatch({ type: 'PREV' }), []);
  const loadMore = useCallback((items: unknown[], total: number) => {
    dispatch({ type: 'LOAD_MORE', items, total });
  }, []);

  return (
    <SlideshowCtx.Provider value={{ state, start, stop, next, prev, loadMore }}>
      {children}
    </SlideshowCtx.Provider>
  );
}

export function useSlideshow() {
  const ctx = useContext(SlideshowCtx);
  if (!ctx) throw new Error('useSlideshow must be used within SlideshowProvider');
  return ctx;
}
