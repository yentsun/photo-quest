/**
 * @file Top-level routing and global state provider.
 */

import { useReducer } from 'react';
import { Routes, Route, BrowserRouter, Navigate } from 'react-router-dom';
import GlobalContext, { initialState, reducer } from '../globalContext';
import { SlideshowProvider } from '../contexts/SlideshowContext.jsx';
import { clientRoutes as r } from '@photo-quest/shared';
import ErrorBoundary from './ErrorBoundary';
import Root from './Root';
import Dashboard from './Dashboard';
import { LikedPage, FolderPage, MediaPage } from './pages/index.js';
import ToasterMessage from './ToasterMessage';

export default function Router() {
  const [state, dispatch] = useReducer(reducer, initialState);

  return (
    <GlobalContext.Provider value={{ state, dispatch }}>
      <SlideshowProvider>
        <ToasterMessage />

        <ErrorBoundary>
          <BrowserRouter>
            <Routes>
              <Route path={r.root} element={<Root />}>
                <Route index element={<Navigate replace to={r.dashboard} />} />
                <Route path={r.dashboard} element={<Dashboard />} />
                <Route path={r.liked} element={<LikedPage />} />
                <Route path={r.folder} element={<FolderPage />} />
                <Route path={r.media} element={<MediaPage />} />
              </Route>
              <Route path="*" element={<Navigate to={r.root} />} />
            </Routes>
          </BrowserRouter>
        </ErrorBoundary>
      </SlideshowProvider>
    </GlobalContext.Provider>
  );
}
