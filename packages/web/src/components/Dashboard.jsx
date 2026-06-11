/**
 * @file Dashboard page component - main media library view.
 */

import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMediaActions } from '../hooks/useMedia.js';
import { useRefresh } from '../contexts/RefreshContext.jsx';
import { useSlideshow } from '../contexts/SlideshowContext.jsx';
import { useScan } from '../contexts/ScanContext.jsx';
import { fetchFolders, fetchMedia, getLastFolders } from '../utils/api.js';
import { idbGetFolders } from '../services/idb.js';
import { FolderCard } from './media/index.js';
import { EmptyState } from './layout/index.js';
import { Button, Icon, Modal, PageLoader } from './ui/index.js';

/**
 * Validate a folder path against the server.
 */
function usePathValidation() {
  const [pathValid, setPathValid] = useState(null);
  const [pathError, setPathError] = useState(null);
  const [pathInfo, setPathInfo] = useState(null); // { files, newEstimate }
  const [checking, setChecking] = useState(false);

  const validate = useCallback(async (path) => {
    if (!path) return;
    setChecking(true);
    setPathValid(null);
    setPathError(null);
    setPathInfo(null);
    try {
      const res = await fetch('/media/check-path', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path }),
      });
      const data = await res.json();
      setPathValid(data.valid);
      setPathError(data.valid ? null : data.error);
      setPathInfo(data.valid ? { files: data.files, newEstimate: data.newEstimate } : null);
    } catch {
      setPathValid(null);
      setPathError('Could not reach server');
    } finally {
      setChecking(false);
    }
  }, []);

  const reset = useCallback(() => {
    setPathValid(null);
    setPathError(null);
    setPathInfo(null);
    setChecking(false);
  }, []);

  return { pathValid, pathError, pathInfo, checking, validate, reset };
}

/**
 * Main library dashboard showing all media.
 */
export default function Dashboard() {
  const navigate = useNavigate();
  const { addFolderWithPath, removeFolder, refreshLibrary } = useMediaActions();
  const { signal, bump } = useRefresh();
  const slideshow = useSlideshow();
  const { isScanning } = useScan();
  const pendingShuffle = useRef(false);

  /* Sync cache — populated by fetchFolders() on every successful load.
     Lets the useState initialisers below resolve synchronously so there is
     no loading flash when pressing browser back from shuffle mode. */

  /* Clear slideshow when returning to dashboard. */
  useEffect(() => { slideshow.stop(); }, []);  // eslint-disable-line react-hooks/exhaustive-deps

  const [scanProgress, setScanProgress] = useState(null);
  const [importProgress, setImportProgress] = useState(null);
  const [showAddFolder, setShowAddFolder] = useState(false);
  const [selectedPath, setSelectedPath] = useState(null);
  const [browsing, setBrowsing] = useState(false);
  const { pathValid, pathError, pathInfo, checking, validate, reset } = usePathValidation();

  /* Sync-cache first so there is no loading flash when returning from shuffle.
     Falls back to empty / loading=true on first ever visit (cache is null). */
  const [folders, setFolders] = useState(() => getLastFolders() || []);
  const [loading, setLoading] = useState(!getLastFolders());

  useEffect(() => {
    let cancelled = false;

    /* 1. Serve stale data from IDB immediately — hides the spinner on first visits
          (sync cache already handled return visits via the useState initialiser).
          Skip when sync cache has data to avoid a visible jump if IDB and server
          sort folders in a different order. */
    idbGetFolders()
      .then(cached => { if (!cancelled && cached.length > 0 && !getLastFolders()) { setFolders(cached); setLoading(false); } })
      .catch(() => {}); // IDB miss is fine; server fetch below will cover it

    /* 2. Refresh from server in the background; IDB + sync cache updated inside fetchFolders. */
    fetchFolders()
      .then(data => { if (!cancelled) { setFolders(data); setLoading(false); } })
      .catch(err => { console.error('Failed to fetch folders:', err); if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [signal]);

  const rootFolders = useMemo(() => folders.filter(f => f.parentId === null), [folders]);

  const totalMedia = useMemo(
    () => rootFolders.reduce((sum, f) => sum + (f.subtreeMediaCount || 0), 0),
    [rootFolders],
  );

  useEffect(() => {
    if (!showAddFolder) {
      setSelectedPath(null);
      setBrowsing(false);
      reset();
    }
  }, [showAddFolder, reset]);

  const handleShuffle = async () => {
    if (totalMedia === 0) return;
    try {
      /* Fetch first page of 200 random items — start immediately, load more lazily. */
      const { items, total } = await fetchMedia({ limit: 200, random: true });
      if (items.length === 0) return;
      pendingShuffle.current = true;
      slideshow.start(items, {
        order: 'sequential', // already randomised by ORDER BY RANDOM() on server
        total,
        loadMore: () => fetchMedia({ limit: 200, random: true }).then(d => d.items),
      });
    } catch (err) {
      console.error('Failed to fetch media for shuffle:', err);
    }
  };

  useEffect(() => {
    if (pendingShuffle.current && slideshow.active && slideshow.current) {
      pendingShuffle.current = false;
      navigate(`/media/${slideshow.current.id}`);
    }
  }, [slideshow.active, slideshow.current, navigate]);

  const handleRefresh = async () => {
    if (rootFolders.length === 0) {
      setScanProgress('No folders to refresh. Add a folder first.');
      setTimeout(() => setScanProgress(null), 3000);
      return;
    }

    setScanProgress('Refreshing library...');

    try {
      const result = await refreshLibrary(folders, (progress) => setScanProgress(progress));
      const totalFolders = result.serverFolders + result.clientFolders;
      setScanProgress(`Refreshed ${totalFolders} folder${totalFolders !== 1 ? 's' : ''}. Found ${result.newFiles} file${result.newFiles !== 1 ? 's' : ''}.`);
      setTimeout(() => setScanProgress(null), 3000);
    } catch (err) {
      console.error('Failed to refresh library:', err);
      setScanProgress('Refresh failed: ' + err.message);
      setTimeout(() => setScanProgress(null), 5000);
    }
  };

  const handleBrowse = async () => {
    setBrowsing(true);
    try {
      const res = await fetch('/open-folder', { method: 'POST' });
      const data = await res.json();
      if (data.cancelled || !data.path) return;
      setSelectedPath(data.path);
      validate(data.path);
    } catch (err) {
      console.error('Failed to open folder dialog:', err);
    } finally {
      setBrowsing(false);
    }
  };

  const handleAddFolder = async () => {
    if (!selectedPath || !pathValid) return;

    setImportProgress(null);

    try {
      const { scanId, total } = await addFolderWithPath(selectedPath);
      setImportProgress({ total, processed: 0 });

      /* Listen to SSE for import progress. */
      const { cancelled } = await new Promise((resolve, reject) => {
        const es = new EventSource('/jobs/events');
        es.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            if (data.scanId !== scanId) return;

            if (data.type === 'import_progress') {
              setImportProgress({ total: data.total, processed: data.processed });
            }
            if (data.type === 'import_complete') {
              setImportProgress({ total: data.total, processed: data.processed });
              es.close();
              resolve({ cancelled: false });
            }
            if (data.type === 'import_cancelled') {
              es.close();
              resolve({ cancelled: true });
            }
          } catch { /* ignore parse errors */ }
        };
        es.onerror = () => { es.close(); reject(new Error('Lost connection')); };
      });

      bump();
      setScanProgress(cancelled ? 'Scan stopped.' : `Imported ${total} files.`);
      setShowAddFolder(false);
      setImportProgress(null);
      setTimeout(() => setScanProgress(null), 3000);
    } catch (err) {
      console.error('Failed to scan folder:', err);
      setScanProgress('Failed: ' + err.message);
      setImportProgress(null);
      setTimeout(() => setScanProgress(null), 5000);
    }
  };

  const handleRemoveFolder = async (folder) => {
    const folderName = folder.path.split(/[/\\]/).filter(Boolean).pop() || 'Folder';
    if (!confirm(`Remove "${folderName}" from library?\n\nYour likes will be preserved if you re-add this folder later.`)) {
      return;
    }
    try {
      const result = await removeFolder(folder.id);
      setScanProgress(`Removed "${folderName}" (${result.hidden} items hidden)`);
      setTimeout(() => setScanProgress(null), 3000);
    } catch (err) {
      console.error('Failed to remove folder:', err);
      alert('Failed to remove folder: ' + err.message);
    }
  };

  if (loading) {
    return <PageLoader message="Fetching your media folders…" />;
  }

  const folderIcon = <Icon name="folder" className="w-16 h-16" />;

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Library</h1>
          <p className="text-gray-400 text-sm">{totalMedia} items</p>
        </div>
        <div className="flex gap-2">
          {totalMedia > 0 && (
            <Button variant="secondary" onClick={handleShuffle} disabled={isScanning} icon={<Icon name="shuffle" className="w-4 h-4" />}>
              <span className="hidden sm:inline">Shuffle</span>
            </Button>
          )}
          {rootFolders.length > 0 && (
            <Button variant="ghost" onClick={handleRefresh} disabled={isScanning} title="Rescan folders for new files" icon={<Icon name="refresh" className="w-4 h-4" />}>
              <span className="hidden sm:inline">Refresh</span>
            </Button>
          )}
          <Button onClick={() => setShowAddFolder(true)} disabled={isScanning} icon={<Icon name="folder" className="w-4 h-4" />}>
            <span className="hidden sm:inline">Add Folder</span>
          </Button>
        </div>
      </div>

      {/* Scan Progress */}
      {scanProgress && (
        <div className="mb-6 p-4 bg-blue-900/30 border border-blue-700/50 rounded-lg">
          <div className="flex items-center gap-3">
            <p className="text-blue-300">{scanProgress}</p>
          </div>
        </div>
      )}

      {/* Add Folder Modal */}
      <Modal
        open={showAddFolder}
        onClose={() => setShowAddFolder(false)}
        title="Add Folder"
      >
        <div className="space-y-4">
          <Button
            variant="secondary"
            onClick={handleBrowse}
            disabled={browsing || !!importProgress}
            className="w-full"
          >
            {browsing ? 'Opening dialog…' : selectedPath ? 'Browse again…' : 'Browse for folder…'}
          </Button>

          {selectedPath && (
            <div className="p-3 rounded-lg bg-gray-700/50 text-sm text-gray-200 break-all">
              {selectedPath}
            </div>
          )}

          {checking && <p className="text-gray-400 text-xs">Checking path…</p>}
          {pathError && <p className="text-red-400 text-xs">{pathError}</p>}
          {pathValid && pathInfo && (
            <p className="text-green-400 text-xs">
              {pathInfo.files} media file{pathInfo.files !== 1 ? 's' : ''} found
              {pathInfo.newEstimate > 0 && ` (${pathInfo.newEstimate} new)`}
              {pathInfo.newEstimate === 0 && pathInfo.files > 0 && ' (all already in library)'}
            </p>
          )}

          {importProgress && (
            <div>
              <div className="flex justify-between text-xs text-gray-400 mb-1">
                <span>Importing files…</span>
                <span>{importProgress.processed}/{importProgress.total}</span>
              </div>
              <div className="w-full bg-gray-700 rounded-full h-2">
                <div
                  className="bg-blue-500 h-2 rounded-full transition-all duration-200"
                  style={{ width: `${importProgress.total ? (importProgress.processed / importProgress.total) * 100 : 0}%` }}
                />
              </div>
            </div>
          )}

          {selectedPath && !isScanning && (
            <Button onClick={handleAddFolder} disabled={!pathValid || checking || browsing}>
              Add
            </Button>
          )}
        </div>
      </Modal>

      {/* Folder Grid or Empty State */}
      {rootFolders.length > 0 ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
          {rootFolders.map(folder => (
            <FolderCard
              key={folder.id}
              folder={folder}
              onRemove={() => handleRemoveFolder(folder)}
            />
          ))}
        </div>
      ) : (
        <EmptyState
          icon={folderIcon}
          title="No media yet"
          description="Add a folder from your device to start building your library."
          action={{
            label: 'Add Folder',
            onClick: () => setShowAddFolder(true),
          }}
        />
      )}
    </div>
  );
}
