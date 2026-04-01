/**
 * @file Library page — browse folders added by the user.
 */

import { useState, useEffect } from 'react';
import { fetchFolders, scanMedia, getImageUrl } from '../../utils/api.js';
import { Spinner, Card, Button, Icon, Input } from '../ui/index.js';
import { EmptyState } from '../layout/index.js';
import { FolderOverlay } from '../media/index.js';
import { ICON_CLASS } from '../ui/Icon.jsx';
import { showToast } from '../ToasterMessage.jsx';

function FolderCard({ folder, onClick }) {
  const name = folder.path.split(/[\\/]/).pop();
  const images = folder.subtreeImageCount ?? folder.imageCount ?? 0;
  const videos = folder.subtreeVideoCount ?? folder.videoCount ?? 0;

  return (
    <Card
      onClick={() => onClick?.(folder)}
      header={<span className="text-gray-400 text-[10px] uppercase tracking-wide">Folder</span>}
      art={
        folder.previewMediaId ? (
          <img src={getImageUrl(folder.previewMediaId)} alt={name} className="w-full h-full object-cover" loading="lazy" />
        ) : (
          <div className="w-full h-full bg-gray-800 flex items-center justify-center text-gray-600 text-3xl">📁</div>
        )
      }
      footer={
        <>
          <p className="text-white text-xs font-medium truncate">{name}</p>
          <p className="text-gray-500 text-[10px] truncate" title={folder.path}>{folder.path}</p>
          <p className="text-gray-500 text-[10px]">
            {images > 0 && `${images} image${images !== 1 ? 's' : ''}`}
            {images > 0 && videos > 0 && ' · '}
            {videos > 0 && `${videos} video${videos !== 1 ? 's' : ''}`}
          </p>
        </>
      }
    />
  );
}

export default function LibraryPage() {
  const [folders, setFolders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [folderPath, setFolderPath] = useState('');
  const [scanning, setScanning] = useState(false);
  const [selectedFolder, setSelectedFolder] = useState(null);

  const reload = () => {
    fetchFolders()
      .then(setFolders)
      .catch(err => console.error('Failed to load folders:', err))
      .finally(() => setLoading(false));
  };

  useEffect(() => { reload(); }, []);

  const handleAddFolder = async () => {
    const path = folderPath.trim();
    if (!path) return;
    setScanning(true);
    try {
      await scanMedia(path);
      showToast('Folder scan started', 'success');
      setFolderPath('');
      setAdding(false);
      setTimeout(reload, 2000);
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setScanning(false);
    }
  };

  const rootFolders = folders.filter(f => !f.parentId);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] gap-3">
        <Spinner size="lg" />
        <p className="text-gray-400 text-sm">Loading library...</p>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white"><Icon name="folder" className={ICON_CLASS.pageHeader} />Library</h1>
          <p className="text-gray-400 text-sm">{rootFolders.length} folder{rootFolders.length !== 1 ? 's' : ''}</p>
        </div>
        <Button variant="secondary" onClick={() => setAdding(!adding)}>
          {adding ? 'Cancel' : 'Add Folder'}
        </Button>
      </div>

      {adding && (
        <div className="mb-6 flex gap-2">
          <Input
            value={folderPath}
            onChange={(e) => setFolderPath(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleAddFolder(); }}
            placeholder="Absolute path to folder..."
            className="flex-1"
            autoFocus
          />
          <Button onClick={handleAddFolder} disabled={scanning || !folderPath.trim()}>
            {scanning ? '...' : 'Scan'}
          </Button>
        </div>
      )}

      {rootFolders.length > 0 ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
          {rootFolders.map(folder => (
            <FolderCard key={folder.id} folder={folder} onClick={setSelectedFolder} />
          ))}
        </div>
      ) : (
        <EmptyState
          title="No folders"
          description="Scan a folder to add media to your library."
        />
      )}

      <FolderOverlay
        folder={selectedFolder}
        onClose={() => setSelectedFolder(null)}
        onRefresh={reload}
      />
    </div>
  );
}
