/**
 * @file Top-level routing and global state provider.
 */

import { useReducer } from 'react';
import { Routes, Route, BrowserRouter, Navigate } from 'react-router-dom';
import GlobalContext, { initialState, reducer } from '../globalContext';
import { SlideshowProvider } from '../contexts/SlideshowContext.jsx';
import { RefreshProvider } from '../contexts/RefreshContext.jsx';
import { ScanProvider } from '../contexts/ScanContext.jsx';
import { JobProgressProvider } from '../contexts/JobProgressContext.jsx';
import { clientRoutes as r } from '@photo-quest/shared';
import ErrorBoundary from './ErrorBoundary';
import Root from './Root';
import TranscodeMonitor from './TranscodeMonitor';
import Dashboard from './Dashboard';
import { LikedPage, FolderPage, MediaPage, TagsPage, TagPage, TranscodesPage } from './pages/index.js';
import ToasterMessage from './ToasterMessage';

export default function Router() {
  const [state, dispatch] = useReducer(reducer, initialState);

  return (
    <GlobalContext.Provider value={{ state, dispatch }}>
      <RefreshProvider>
        <ScanProvider>
        <JobProgressProvider>
        <SlideshowProvider>
          <TranscodeMonitor />
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
                  <Route path={r.tags} element={<TagsPage />} />
                  <Route path={r.tag} element={<TagPage />} />
                  <Route path={r.transcodes} element={<TranscodesPage />} />
                </Route>
                <Route path="*" element={<Navigate to={r.root} />} />
              </Routes>
            </BrowserRouter>
          </ErrorBoundary>
        </SlideshowProvider>
        </JobProgressProvider>
        </ScanProvider>
      </RefreshProvider>
    </GlobalContext.Provider>
  );
}
