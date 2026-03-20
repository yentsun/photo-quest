/**
 * @file Dashboard page component - main media library view.
 */

import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMediaActions } from '../hooks/useMedia.js';
import { useRefresh } from '../contexts/RefreshContext.jsx';
import { useSlideshow } from '../contexts/SlideshowContext.jsx';
import { fetchFolders, fetchMedia } from '../utils/api.js';
import { FolderCard } from './media/index.js';
import { EmptyState } from './layout/index.js';
import { Button, Icon, Input, Modal, Spinner } from './ui/index.js';

/**
 * Debounced path validation against the server.
 */
function usePathValidation() {
  const [pathValid, setPathValid] = useState(null);
  const [pathError, setPathError] = useState(null);
  const [pathInfo, setPathInfo] = useState(null); // { files, newEstimate }
  const [checking, setChecking] = useState(false);
  const timerRef = useRef(null);

  const validate = useCallback((value) => {
    clearTimeout(timerRef.current);
    const trimmed = value.trim();

    if (!trimmed) {
      setPathValid(null);
      setPathError(null);
      setPathInfo(null);
      setChecking(false);
      return;
    }

    setChecking(true);
    timerRef.current = setTimeout(async () => {
      try {
        const res = await fetch('/media/check-path', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path: trimmed }),
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
    }, 300);
  }, []);

  const reset = useCallback(() => {
    clearTimeout(timerRef.current);
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
  const pendingShuffle = useRef(false);
  const [scanning, setScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState(null);
  const [importProgress, setImportProgress] = useState(null);
  const [showAddFolder, setShowAddFolder] = useState(false);
  const pathRef = useRef(null);
  const { pathValid, pathError, pathInfo, checking, validate, reset } = usePathValidation();

  /* Fetch folders on mount and when refresh signal changes. */
  const [folders, setFolders] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
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
    if (!showAddFolder) reset();
  }, [showAddFolder, reset]);

  const handleShuffle = async () => {
    if (totalMedia === 0) return;
    try {
      const { items } = await fetchMedia();
      if (items.length === 0) return;
      pendingShuffle.current = true;
      slideshow.start(items, { order: 'random' });
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

    setScanning(true);
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
    } finally {
      setScanning(false);
    }
  };

  const handleAddFolder = async (e) => {
    e.preventDefault();
    const folderPath = pathRef.current?.value?.trim();
    if (!folderPath || !pathValid) return;

    setScanning(true);
    setImportProgress(null);

    try {
      const { scanId, total } = await addFolderWithPath(folderPath);
      setImportProgress({ total, processed: 0 });

      /* Listen to SSE for import progress. */
      await new Promise((resolve, reject) => {
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
              resolve();
            }
          } catch { /* ignore parse errors */ }
        };
        es.onerror = () => { es.close(); reject(new Error('Lost connection')); };
      });

      bump();
      setScanProgress(`Imported ${total} files.`);
      setShowAddFolder(false);
      setImportProgress(null);
      setTimeout(() => setScanProgress(null), 3000);
    } catch (err) {
      console.error('Failed to scan folder:', err);
      setScanProgress('Failed: ' + err.message);
      setImportProgress(null);
      setTimeout(() => setScanProgress(null), 5000);
    } finally {
      setScanning(false);
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
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] gap-3">
        <Spinner size="lg" />
        <p className="text-gray-400 text-sm">Loading library...</p>
      </div>
    );
  }

  const folderIcon = <Icon name="folder" className="w-16 h-16" />;

  const inputVariant = pathValid === true ? 'success' : pathValid === false ? 'error' : 'default';

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
            <Button variant="secondary" onClick={handleShuffle}>
              Shuffle
            </Button>
          )}
          {rootFolders.length > 0 && (
            <Button
              variant="ghost"
              onClick={handleRefresh}
              disabled={scanning}
              title="Rescan folders for new files"
            >
              Refresh
            </Button>
          )}
          <Button onClick={() => setShowAddFolder(true)} disabled={scanning}>
            {scanning ? 'Scanning...' : 'Add Folder'}
          </Button>
        </div>
      </div>

      {/* Scan Progress */}
      {scanProgress && (
        <div className="mb-6 p-4 bg-blue-900/30 border border-blue-700/50 rounded-lg">
          <div className="flex items-center gap-3">
            {scanning && <Spinner size="sm" />}
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
          <p className="text-gray-300">
            Paste the full folder path from File Explorer:
          </p>
          <form onSubmit={handleAddFolder} className="space-y-3">
            <div>
              <Input
                ref={pathRef}
                type="text"
                placeholder="e.g. C:\Users\work\Pictures\Vacation"
                variant={inputVariant}
                autoFocus
                onChange={(e) => {
                  const cleaned = e.target.value.replace(/^["']+|["']+$/g, '').trim();
                  if (cleaned !== e.target.value) e.target.value = cleaned;
                  validate(cleaned);
                }}
              />
              {checking && (
                <p className="text-gray-400 text-xs mt-1">Checking path...</p>
              )}
              {pathError && (
                <p className="text-red-400 text-xs mt-1">{pathError}</p>
              )}
              {pathValid && pathInfo && (
                <p className="text-green-400 text-xs mt-1">
                  {pathInfo.files} media file{pathInfo.files !== 1 ? 's' : ''} found
                  {pathInfo.newEstimate > 0 && ` (${pathInfo.newEstimate} new)`}
                  {pathInfo.newEstimate === 0 && pathInfo.files > 0 && ' (all already in library)'}
                </p>
              )}
            </div>
            {importProgress && (
              <div>
                <div className="flex justify-between text-xs text-gray-400 mb-1">
                  <span>Importing files...</span>
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
            <Button type="submit" disabled={scanning || !pathValid}>
              {scanning ? 'Importing...' : 'Add'}
            </Button>
          </form>
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
