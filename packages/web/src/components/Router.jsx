/**
 * @file Top-level routing and global state provider.
 */

import { useEffect, useReducer } from 'react';
import { Routes, Route, BrowserRouter, Navigate } from 'react-router-dom';
import GlobalContext, { initialState, reducer } from '../globalContext';
import { SlideshowProvider } from '../contexts/SlideshowContext.jsx';
import { RefreshProvider } from '../contexts/RefreshContext.jsx';
import { clientRoutes as r } from '@photo-quest/shared';
import ErrorBoundary from './ErrorBoundary';
import Root from './Root';
import { DeckPage, FolderPage, LibraryPage, MediaPage, MemoryGamePage, InventoryPage, QuestPage, MarketPage } from './pages/index.js';
import ToasterMessage from './ToasterMessage';
import { syncAll } from '../db/sync.js';

export default function Router() {
  const [state, dispatch] = useReducer(reducer, initialState);

  /* Local-first sync: pull on app mount and on tab focus. Stale-while-
   * revalidate — pages render from IndexedDB immediately and live queries
   * update once the pull completes. Phase 0: syncAll is a no-op stub. */
  useEffect(() => {
    syncAll();
    const onFocus = () => { if (document.visibilityState === 'visible') syncAll(); };
    document.addEventListener('visibilitychange', onFocus);
    return () => document.removeEventListener('visibilitychange', onFocus);
  }, []);

  return (
    <GlobalContext.Provider value={{ state, dispatch }}>
      <RefreshProvider>
        <SlideshowProvider>
          <ToasterMessage />

          <ErrorBoundary>
            <BrowserRouter>
              <Routes>
                <Route path={r.root} element={<Root />}>
                  <Route index element={<Navigate replace to={r.inventory} />} />
                  <Route path={r.dashboard} element={<Navigate replace to={r.inventory} />} />
                  <Route path={r.library} element={<LibraryPage />} />
                  <Route path={r.folder} element={<FolderPage />} />
                  <Route path={r.media} element={<MediaPage />} />
                  <Route path={r.memoryGame} element={<MemoryGamePage />} />
                  <Route path={r.deck} element={<DeckPage />} />
                  <Route path={r.inventory} element={<InventoryPage />} />
                  <Route path={r.quest} element={<QuestPage />} />
                  <Route path={r.market} element={<MarketPage />} />
                </Route>
                <Route path="*" element={<Navigate to={r.root} />} />
              </Routes>
            </BrowserRouter>
          </ErrorBoundary>
        </SlideshowProvider>
      </RefreshProvider>
    </GlobalContext.Provider>
  );
}
