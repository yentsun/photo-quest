/**
 * @file Top-level routing and global state provider.
 */

import { useEffect, useReducer, useRef } from 'react';
import { Routes, Route, BrowserRouter, Navigate, useLocation } from 'react-router-dom';
import GlobalContext, { initialState, reducer } from '../globalContext';
import { saveNavLocation, getSavedNavPath } from '../utils/sessionNav.js';
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

/** Persists the current view so a sleep/wake reload can resume it. The very
    first location we see is the one the app was (re)loaded with; for a landing
    reload saving it would wipe the saved view, so we skip only that first
    location and record every real navigation after it. */
function ResumeView() {
  const location = useLocation();
  const firstRun = useRef(true);

  useEffect(() => {
    if (firstRun.current) { firstRun.current = false; return; }
    saveNavLocation(location);
  }, [location]);

  return null;
}

/** The index `/` route. When the app reloads on the landing URL it resolves to
    the last saved view (so a sleep/wake reset resumes where the user left off),
    otherwise it falls back to the dashboard. Rendering this at the index route
    makes it the single navigation that fires on `/`, so it can never race a
    competing redirect. */
function IndexRedirect() {
  const saved = getSavedNavPath();
  const target = saved && saved.startsWith('/') ? saved : r.dashboard;
  return <Navigate replace to={target} />;
}

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
              <ResumeView />
              <Routes>
                <Route path={r.root} element={<Root />}>
                  <Route index element={<IndexRedirect />} />
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
