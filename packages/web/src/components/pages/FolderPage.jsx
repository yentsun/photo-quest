/**
 * @file Folder view page - shows media filtered by folder path.
 */

import { useParams } from 'react-router-dom';
import { useMedia } from '../../hooks/useMedia.js';
import { useSlideshow } from '../../contexts/SlideshowContext.jsx';
import { MediaGrid } from '../media/index.js';
import { EmptyState } from '../layout/index.js';
import { Button, Spinner } from '../ui/index.js';

/**
 * Page showing media from a specific folder.
 */
export default function FolderPage() {
  const { path } = useParams();
  const decodedPath = decodeURIComponent(path || '');
  const { loading, likeMedia, getMediaByFolder } = useMedia();
  const { start: startSlideshow, open: openMedia } = useSlideshow();

  const folderMedia = getMediaByFolder(decodedPath);

  const handleMediaClick = (clickedMedia) => {
    const index = folderMedia.findIndex(m => m.id === clickedMedia.id);
    openMedia(folderMedia, index);
  };

  const handleRandomSlideshow = () => {
    startSlideshow(folderMedia, { order: 'random' });
  };

  const handleSequentialSlideshow = () => {
    startSlideshow(folderMedia, { order: 'sequential' });
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

  // Get just the folder name from the path
  const folderName = decodedPath.split(/[/\\]/).filter(Boolean).pop() || 'Folder';

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">{folderName}</h1>
          <p className="text-gray-400 text-sm truncate max-w-md" title={decodedPath}>
            {folderMedia.length} items
          </p>
        </div>
        {folderMedia.length > 0 && (
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

      {/* Media Grid or Empty State */}
      <MediaGrid
        items={folderMedia}
        onItemClick={handleMediaClick}
        onItemLike={likeMedia}
        emptyState={
          <EmptyState
            icon={folderIcon}
            title="Folder not found"
            description="This folder doesn't exist or contains no media."
          />
        }
      />
    </div>
  );
}
