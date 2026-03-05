/**
 * @file Liked media page - shows items with likes > 0.
 */

import { useMemo } from 'react';
import { useMedia } from '../../hooks/useMedia.js';
import { useSlideshow } from '../../contexts/SlideshowContext.jsx';
import { MediaGrid } from '../media/index.js';
import { EmptyState } from '../layout/index.js';
import { Button, Spinner } from '../ui/index.js';

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
      <div className="flex items-center justify-center min-h-[50vh]">
        <Spinner size="lg" />
      </div>
    );
  }

  const heartIcon = (
    <svg className="w-16 h-16" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
    </svg>
  );

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
