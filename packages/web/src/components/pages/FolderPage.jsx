/**
 * @file Folder view page - shows subfolders and media for a folder ID.
 * LAW 2.7: maintains folder hierarchy with breadcrumb navigation.
 */

import { useParams, useNavigate } from 'react-router-dom';
import { useMedia } from '../../hooks/useMedia.js';
import { useSlideshow } from '../../contexts/SlideshowContext.jsx';
import { FolderCard } from '../media/index.js';
import { MediaGrid } from '../media/index.js';
import { EmptyState } from '../layout/index.js';
import { Button, Icon, Spinner } from '../ui/index.js';

/**
 * Page showing subfolders and media from a specific folder.
 */
export default function FolderPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const {
    loading, likeMedia, getFolderById, getSubfolders,
    getMediaByFolder, getMediaInSubtree, getBreadcrumbs,
  } = useMedia();
  const { start: startSlideshow, open: openMedia } = useSlideshow();

  const folder = getFolderById(Number(id));
  const subfolders = folder ? getSubfolders(folder.id) : [];
  const directMedia = folder ? getMediaByFolder(folder.path) : [];
  const subtreeMedia = folder ? getMediaInSubtree(folder.path) : [];
  const breadcrumbs = folder ? getBreadcrumbs(folder.id) : [];

  const handleMediaClick = (clickedMedia) => {
    const index = directMedia.findIndex(m => m.id === clickedMedia.id);
    openMedia(directMedia, index);
  };

  const handleRandomSlideshow = () => {
    startSlideshow(subtreeMedia, { order: 'random' });
  };

  const handleSequentialSlideshow = () => {
    startSlideshow(subtreeMedia, { order: 'sequential' });
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] gap-3">
        <Spinner size="lg" />
        <p className="text-gray-400 text-sm">Loading folder...</p>
      </div>
    );
  }

  const folderIcon = <Icon name="folder" className="w-16 h-16" />;

  const folderName = folder
    ? folder.path.split(/[/\\]/).filter(Boolean).pop() || 'Folder'
    : 'Folder';

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      {/* Breadcrumbs */}
      {breadcrumbs.length > 0 && (
        <nav className="flex items-center gap-1 text-sm text-gray-400 mb-4 overflow-x-auto">
          <button
            onClick={() => navigate('/dashboard')}
            className="hover:text-white transition-colors shrink-0"
          >
            Library
          </button>
          {breadcrumbs.map((crumb, i) => {
            const name = crumb.path.split(/[/\\]/).filter(Boolean).pop();
            const isLast = i === breadcrumbs.length - 1;
            return (
              <span key={crumb.id} className="flex items-center gap-1 shrink-0">
                <span className="text-gray-600">/</span>
                {isLast ? (
                  <span className="text-white">{name}</span>
                ) : (
                  <button
                    onClick={() => navigate(`/folder/${crumb.id}`)}
                    className="hover:text-white transition-colors"
                  >
                    {name}
                  </button>
                )}
              </span>
            );
          })}
        </nav>
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">{folderName}</h1>
          <p className="text-gray-400 text-sm">
            {subfolders.length > 0 && `${subfolders.length} folder${subfolders.length !== 1 ? 's' : ''}`}
            {subfolders.length > 0 && directMedia.length > 0 && ', '}
            {directMedia.length > 0 && `${directMedia.length} item${directMedia.length !== 1 ? 's' : ''}`}
            {subfolders.length === 0 && directMedia.length === 0 && '0 items'}
          </p>
        </div>
        {subtreeMedia.length > 0 && (
          <div className="flex gap-2">
            <Button variant="secondary" onClick={handleSequentialSlideshow}>
              Sequential
            </Button>
            <Button onClick={handleRandomSlideshow}>
              Random
            </Button>
          </div>
        )}
      </div>

      {/* Subfolders */}
      {subfolders.length > 0 && (
        <div className="mb-6">
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            {subfolders.map(sub => (
              <FolderCard
                key={sub.id}
                folder={sub}
                items={getMediaInSubtree(sub.path)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Media Grid or Empty State */}
      {directMedia.length > 0 ? (
        <MediaGrid
          items={directMedia}
          onItemClick={handleMediaClick}
          onItemLike={likeMedia}
        />
      ) : subfolders.length === 0 ? (
        <EmptyState
          icon={folderIcon}
          title="Folder not found"
          description="This folder doesn't exist or contains no media."
        />
      ) : null}
    </div>
  );
}
