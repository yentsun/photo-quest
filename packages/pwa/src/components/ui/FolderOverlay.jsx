import Button from './Button.jsx';
import Card from './Card.jsx';
import { useKeydown } from '../../hooks/useKeydown.js';
import { refreshFolder } from '../../db/actions.js';
import './CardOverlay.css';

function folderName(folderPath) {
  return folderPath.split(/[\\/]/).filter(Boolean).pop() || folderPath;
}

export default function FolderOverlay({ folder, serverUrl, onClose }) {
  useKeydown((e) => { if (e.key === 'Escape') onClose(); }, !!folder, [onClose]);

  if (!folder) return null;

  const name = folderName(folder.path);
  const images = folder.subtreeImageCount ?? folder.imageCount ?? 0;
  const videos = folder.subtreeVideoCount ?? folder.videoCount ?? 0;
  const previewUrl = folder.previewMediaId ? `${serverUrl}/image/${folder.previewMediaId}` : null;

  const handleRefresh = () => {
    refreshFolder(folder.path);
    onClose();
  };

  return (
    <div className="overlay" onClick={onClose}>
      <div className="overlay__card" onClick={(e) => e.stopPropagation()}>
        <Card
          size="large"
          header={name}
          art={
            previewUrl
              ? <img src={previewUrl} alt={name} />
              : <div style={{ width: '100%', height: '100%', background: '#1f2937',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              color: '#4b5563', fontSize: '4rem' }}>📁</div>
          }
          footer={
            <>
              <div style={{ color: '#6b7280', overflow: 'hidden', textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap', fontSize: '0.75rem' }} title={folder.path}>
                {folder.path}
              </div>
              <div>
                {images > 0 && `${images} image${images !== 1 ? 's' : ''}`}
                {images > 0 && videos > 0 && ' · '}
                {videos > 0 && `${videos} video${videos !== 1 ? 's' : ''}`}
              </div>
            </>
          }
        />
        <div className="overlay__actions">
          <Button variant="secondary" onClick={handleRefresh}>Refresh</Button>
        </div>
      </div>
    </div>
  );
}
