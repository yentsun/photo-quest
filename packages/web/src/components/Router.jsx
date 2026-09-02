/**
 * @file Top-level routing and global state provider.
 */

import { useEffect, useReducer, useRef } from 'react';
import { Routes, Route, BrowserRouter, Navigate, useLocation, useNavigate } from 'react-router-dom';
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

/** Persists the current view and, when a reload lands on the landing route,
    navigates back to the last non-landing view so a sleep/wake reload resumes
    where the user left off. */
function ResumeView() {
  const location = useLocation();
  const navigate = useNavigate();
  const firstRun = useRef(true);

  /* Persist the view on every real navigation. The very first location we see
     is the one the app was (re)loaded with — for a sleep/wake reload that is a
     landing route, and saving it would wipe the saved view before the restore
     effect below can fire. We skip it so an automatic `/` → `/dashboard`
     redirect never destroys the resume target. */
  useEffect(() => {
    if (firstRun.current) { firstRun.current = false; return; }
    saveNavLocation(location);
  }, [location]);

  /* On load, if the browser landed on the landing route (`/` or `/dashboard`)
     but a previous view was saved, navigate back to it. This runs once on the
     boot location, so it sees whichever landing route the reload produced. */
  useEffect(() => {
    const saved = getSavedNavPath();
    const current = location.pathname + (location.search || '');
    if (saved && (location.pathname === '/' || location.pathname === '/dashboard') && saved !== current) {
      navigate(saved, { replace: true });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return null;
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
