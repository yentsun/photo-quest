import Button from '../components/ui/Button.jsx';
import Card from '../components/ui/Card.jsx';
import Spinner from '../components/ui/Spinner.jsx';
import EmptyState from '../components/EmptyState.jsx';
import { useLocalStore } from '../hooks/useLocalStore.js';
import { STORES } from '../db/localDb.js';
import './LibraryPage.css';

function folderName(folderPath) {
  return folderPath.split(/[\\/]/).filter(Boolean).pop() || folderPath;
}

function FolderCard({ folder, serverUrl, onClick }) {
  const name = folderName(folder.path);
  const images = folder.subtreeImageCount ?? folder.imageCount ?? 0;
  const videos = folder.subtreeVideoCount ?? folder.videoCount ?? 0;
  const previewUrl = folder.previewMediaId ? `${serverUrl}/image/${folder.previewMediaId}` : null;

  return (
    <Card
      onClick={onClick ? () => onClick(folder) : undefined}
      header={name}
      art={
        previewUrl
          ? <img src={previewUrl} alt={name} loading="lazy" draggable={false} />
          : <div className="library__folder-placeholder">📁</div>
      }
      footer={
        <>
          <div className="library__folder-path" title={folder.path}>{folder.path}</div>
          <div>
            {images > 0 && `${images} image${images !== 1 ? 's' : ''}`}
            {images > 0 && videos > 0 && ' · '}
            {videos > 0 && `${videos} video${videos !== 1 ? 's' : ''}`}
          </div>
        </>
      }
    />
  );
}

export default function LibraryPage({ onLookForServer, server, sync }) {
  const folders = useLocalStore(STORES.FOLDERS);

  if (!server) {
    return (
      <EmptyState
        icon="📚"
        title="Library"
        text="Connect to your server to browse folders."
        action={
          <Button variant="primary" size="lg" onClick={onLookForServer}>
            Look for server
          </Button>
        }
      />
    );
  }

  if (folders === null) return <Spinner label="Loading library…" />;

  const rootFolders = folders.filter(f => !f.parentId);

  if (!rootFolders.length) {
    if (sync?.phase === 'idle' || sync?.phase === 'syncing') {
      return <Spinner label="Loading library…" />;
    }
    return (
      <EmptyState
        icon="📚"
        title="No folders yet"
        text="Scan a folder on your server to start building a library."
      />
    );
  }

  return (
    <div className="library">
      {rootFolders.map(folder => (
        <FolderCard key={folder.id} folder={folder} serverUrl={server.url} />
      ))}
    </div>
  );
}
