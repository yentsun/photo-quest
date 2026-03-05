/**
 * @file Dashboard page component - main media library view.
 */

import { useState, useRef } from 'react';
import { useMedia } from '../hooks/useMedia.js';
import { useSlideshow } from '../contexts/SlideshowContext.jsx';
import { MediaGrid } from './media/index.js';
import { EmptyState } from './layout/index.js';
import { Button, IconButton, Modal, Spinner } from './ui/index.js';
import { isFileSystemSupported } from '../services/fileSystem.js';

/**
 * Main library dashboard showing all media.
 */
export default function Dashboard() {
  const { media, loading, folders, likeMedia, pickAndAddFolder, addFolderWithPath, addFolderClientSide, removeFolder, refreshLibrary } = useMedia();
  const { start: startSlideshow, open: openMedia } = useSlideshow();
  const [scanning, setScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState(null);
  const [showFolders, setShowFolders] = useState(false);
  const [pathPrompt, setPathPrompt] = useState(null); // { folderName, folderId, files }
  const manualPathRef = useRef(null);

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

  const handleAddFolder = async () => {
    if (!isFileSystemSupported()) {
      alert('Your browser does not support folder selection. Please use Chrome or Edge.');
      return;
    }

    setScanning(true);
    setScanProgress('Opening folder picker...');

    try {
      const result = await pickAndAddFolder();

      if (result.source === 'needs-path') {
        // Server couldn't find folder - prompt for manual path
        setScanning(false);
        setScanProgress(null);
        setPathPrompt({
          folderName: result.folderName,
          folderId: result.folderId,
          files: result.files,
        });
        return;
      }

      const sourceMsg = result.source === 'server'
        ? 'Server-side scan (accessible from all devices)'
        : 'Client-side scan (local access only)';
      setScanProgress(`Added ${result.added} files. ${sourceMsg}`);

      // Clear message after 3 seconds
      setTimeout(() => setScanProgress(null), 3000);
    } catch (err) {
      if (err.name !== 'AbortError') {
        console.error('Failed to add folder:', err);
        alert('Failed to add folder: ' + err.message);
      }
      setScanProgress(null);
    } finally {
      setScanning(false);
    }
  };

  const handlePathSubmit = async (e) => {
    e.preventDefault();
    const manualPath = manualPathRef.current?.value?.trim();
    if (!manualPath) return;

    setScanning(true);
    setScanProgress('Scanning folder...');

    try {
      const result = await addFolderWithPath(manualPath);
      setScanProgress(`Added ${result.added} files. Server-side scan (accessible from all devices)`);
      setPathPrompt(null);
      setTimeout(() => setScanProgress(null), 3000);
    } catch (err) {
      console.error('Failed to scan folder:', err);
      alert('Failed to scan folder: ' + err.message);
      setScanProgress(null);
    } finally {
      setScanning(false);
    }
  };

  const handleUseClientSide = async () => {
    if (!pathPrompt) return;

    setScanning(true);
    setScanProgress('Adding folder (local access only)...');

    try {
      const result = await addFolderClientSide(pathPrompt.folderId, pathPrompt.folderName, pathPrompt.files);
      setScanProgress(`Added ${result.added} files. Client-side scan (local access only)`);
      setPathPrompt(null);
      setTimeout(() => setScanProgress(null), 3000);
    } catch (err) {
      console.error('Failed to add folder:', err);
      alert('Failed to add folder: ' + err.message);
      setScanProgress(null);
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
          <Button onClick={handleAddFolder} disabled={scanning}>
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

      {/* Manual Path Modal */}
      <Modal
        open={!!pathPrompt}
        onClose={() => setPathPrompt(null)}
        title="Folder Path Required"
      >
        <div className="space-y-4">
          <p className="text-gray-300">
            Could not automatically locate <strong className="text-white">"{pathPrompt?.folderName}"</strong> on the server.
          </p>
          <p className="text-gray-400 text-sm">
            To enable cross-device access (viewing on mobile/other computers), paste the full folder path from File Explorer:
          </p>
          <form onSubmit={handlePathSubmit} className="space-y-3">
            <input
              ref={manualPathRef}
              type="text"
              placeholder="e.g. D:\Photos\SFW"
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-blue-500"
              autoFocus
            />
            <div className="flex gap-2">
              <Button type="submit" disabled={scanning}>
                {scanning ? 'Scanning...' : 'Use Server Path'}
              </Button>
              <Button variant="secondary" type="button" onClick={handleUseClientSide} disabled={scanning}>
                Skip (Local Only)
              </Button>
            </div>
          </form>
          <p className="text-gray-500 text-xs">
            "Local Only" means media will only be accessible on this device.
          </p>
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
              onClick: handleAddFolder,
            }}
          />
        }
      />
    </div>
  );
}
