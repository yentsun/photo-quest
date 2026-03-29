/**
 * @file Top-level routing and global state provider.
 */

import { useReducer } from 'react';
import { Routes, Route, BrowserRouter, Navigate } from 'react-router-dom';
import GlobalContext, { initialState, reducer } from '../globalContext';
import { SlideshowProvider } from '../contexts/SlideshowContext.jsx';
import { RefreshProvider } from '../contexts/RefreshContext.jsx';
import { clientRoutes as r } from '@photo-quest/shared';
import ErrorBoundary from './ErrorBoundary';
import Root from './Root';
import { FolderPage, MediaPage, MemoryGamePage, InventoryPage, QuestPage } from './pages/index.js';
import ToasterMessage from './ToasterMessage';

export default function Router() {
  const [state, dispatch] = useReducer(reducer, initialState);

  return (
    <GlobalContext.Provider value={{ state, dispatch }}>
      <RefreshProvider>
        <SlideshowProvider>
          <ToasterMessage />

          <ErrorBoundary>
            <BrowserRouter>
              <Routes>
                <Route path={r.root} element={<Root />}>
                  <Route index element={<Navigate replace to={r.quest} />} />
                  <Route path={r.dashboard} element={<Navigate replace to={r.quest} />} />
                  <Route path={r.folder} element={<FolderPage />} />
                  <Route path={r.media} element={<MediaPage />} />
                  <Route path={r.memoryGame} element={<MemoryGamePage />} />
                  <Route path={r.inventory} element={<InventoryPage />} />
                  <Route path={r.quest} element={<QuestPage />} />
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
