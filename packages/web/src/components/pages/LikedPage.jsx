/**
 * @file Liked media page - shows items with likes > 0.
 */

import { useMemo } from 'react';
import { useMedia } from '../../hooks/useMedia.js';
import { useSlideshow } from '../../contexts/SlideshowContext.jsx';
import { MediaGrid } from '../media/index.js';
import { EmptyState } from '../layout/index.js';
import { Button, Icon, Spinner } from '../ui/index.js';

/**
 * Page showing all liked media items.
 */
export default function LikedPage() {
  const { loading, likedMedia, likeMedia } = useMedia();
  const { start: startSlideshow, open: openMedia } = useSlideshow();

  // Sort by like count descending
  const sortedLikedMedia = useMemo(() => {
    return [...likedMedia].sort((a, b) => (b.likes || 0) - (a.likes || 0));
  }, [likedMedia]);

  const handleMediaClick = (clickedMedia) => {
    const index = sortedLikedMedia.findIndex(m => m.id === clickedMedia.id);
    openMedia(sortedLikedMedia, index);
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] gap-3">
        <Spinner size="lg" />
        <p className="text-gray-400 text-sm">Loading liked items...</p>
      </div>
    );
  }

  const heartIcon = <Icon name="heart" className="w-16 h-16" />;

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Liked</h1>
          <p className="text-gray-400 text-sm">{sortedLikedMedia.length} items</p>
        </div>
        {sortedLikedMedia.length > 0 && (
          <Button
            variant="secondary"
            onClick={() => startSlideshow(sortedLikedMedia, { order: 'random' })}
          >
            Slideshow
          </Button>
        )}
      </div>

      {/* Media Grid or Empty State */}
      <MediaGrid
        items={sortedLikedMedia}
        onItemClick={handleMediaClick}
        onItemLike={likeMedia}
        emptyState={
          <EmptyState
            icon={heartIcon}
            title="No liked items"
            description="Like photos and videos in your library to see them here."
          />
        }
      />
    </div>
  );
}
