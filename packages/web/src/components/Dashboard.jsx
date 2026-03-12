/**
 * @file Dashboard page component - main media library view.
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import { useMedia } from '../hooks/useMedia.js';
import { useSlideshow } from '../contexts/SlideshowContext.jsx';
import { MediaGrid } from './media/index.js';
import { EmptyState } from './layout/index.js';
import { Button, IconButton, Modal, Spinner } from './ui/index.js';

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
  const { media, loading, folders, likeMedia, addFolderWithPath, removeFolder, refreshLibrary } = useMedia();
  const { start: startSlideshow, open: openMedia } = useSlideshow();
  const [scanning, setScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState(null);
  const [showFolders, setShowFolders] = useState(false);
  const [showAddFolder, setShowAddFolder] = useState(false);
  const pathRef = useRef(null);
  const { pathValid, pathError, pathInfo, checking, validate, reset } = usePathValidation();

  useEffect(() => {
    if (!showAddFolder) reset();
  }, [showAddFolder, reset]);

  const handleRefresh = async () => {
    if (folders.length === 0) {
      setScanProgress('No folders to refresh. Add a folder first.');
      setTimeout(() => setScanProgress(null), 3000);
      return;
    }

    setScanning(true);
    setScanProgress('Refreshing library...');

    try {
      const result = await refreshLibrary((progress) => setScanProgress(progress));
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
    setScanProgress('Scanning folder...');

    try {
      const result = await addFolderWithPath(folderPath);
      setScanProgress(`Added ${result.added} files.`);
      setShowAddFolder(false);
      setTimeout(() => setScanProgress(null), 3000);
    } catch (err) {
      console.error('Failed to scan folder:', err);
      setScanProgress('Failed: ' + err.message);
      setTimeout(() => setScanProgress(null), 5000);
    } finally {
      setScanning(false);
    }
  };

  const handleMediaClick = (clickedMedia) => {
    const index = media.findIndex(m => m.id === clickedMedia.id);
    openMedia(media, index);
  };

  const handleRemoveFolder = async (folderName) => {
    if (!confirm(`Remove "${folderName}" from library?\n\nYour likes will be preserved if you re-add this folder later.`)) {
      return;
    }
    try {
      const result = await removeFolder(folderName);
      setScanProgress(`Removed "${folderName}" (${result.hidden} items hidden)`);
      setTimeout(() => setScanProgress(null), 3000);
    } catch (err) {
      console.error('Failed to remove folder:', err);
      alert('Failed to remove folder: ' + err.message);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Spinner size="lg" />
      </div>
    );
  }

  const folderIcon = (
    <svg className="w-16 h-16" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
    </svg>
  );

  // Border color for path input
  const borderColor = pathValid === true
    ? 'border-green-500'
    : pathValid === false
      ? 'border-red-500'
      : 'border-gray-600';

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Library</h1>
          <p className="text-gray-400 text-sm">{media.length} items</p>
        </div>
        <div className="flex gap-2">
          {folders.length > 0 && (
            <Button
              variant="ghost"
              onClick={() => setShowFolders(!showFolders)}
              title="Manage folders"
            >
              {showFolders ? 'Hide Folders' : `Folders (${folders.length})`}
            </Button>
          )}
          {media.length > 0 && (
            <Button
              variant="secondary"
              onClick={() => startSlideshow(media, { order: 'random' })}
            >
              Slideshow
            </Button>
          )}
          {folders.length > 0 && (
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

      {/* Folders Section */}
      {showFolders && folders.length > 0 && (
        <div className="mb-6 p-4 bg-gray-800/50 rounded-lg">
          <h3 className="text-sm font-medium text-gray-400 mb-3">Library Folders</h3>
          <div className="flex flex-wrap gap-2">
            {folders.map(folder => (
              <div
                key={folder}
                className="flex items-center gap-2 px-3 py-2 bg-gray-700 rounded-lg"
              >
                <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                </svg>
                <span className="text-gray-200">{folder}</span>
                <IconButton
                  icon={<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>}
                  onClick={() => handleRemoveFolder(folder)}
                  label={`Remove "${folder}" from library`}
                  size="sm"
                  className="ml-1 text-gray-500 hover:text-red-400"
                />
              </div>
            ))}
          </div>
        </div>
      )}

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
              <input
                ref={pathRef}
                type="text"
                placeholder="e.g. C:\Users\work\Pictures\Vacation"
                className={`w-full px-3 py-2 bg-gray-700 border ${borderColor} rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-blue-500`}
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
            <Button type="submit" disabled={scanning || !pathValid}>
              {scanning ? 'Scanning...' : 'Add'}
            </Button>
          </form>
        </div>
      </Modal>

      {/* Media Grid or Empty State */}
      <MediaGrid
        items={media}
        onItemClick={handleMediaClick}
        onItemLike={likeMedia}
        emptyState={
          <EmptyState
            icon={folderIcon}
            title="No media yet"
            description="Add a folder from your device to start building your library."
            action={{
              label: 'Add Folder',
              onClick: () => setShowAddFolder(true),
            }}
          />
        }
      />
    </div>
  );
}
