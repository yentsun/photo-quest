/**
 * @file Liked media page - shows items with likes > 0.
 */

import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMediaActions } from '../../hooks/useMedia.js';
import { useRefresh } from '../../contexts/RefreshContext.jsx';
import { useSlideshow } from '../../contexts/SlideshowContext.jsx';
import { fetchMedia } from '../../utils/api.js';
import { MediaGrid } from '../media/index.js';
import { EmptyState } from '../layout/index.js';
import { Button, Icon, Spinner } from '../ui/index.js';

/**
 * Page showing all liked media items.
 */
export default function LikedPage() {
  const navigate = useNavigate();
  const { likeMedia } = useMediaActions();
  const { signal } = useRefresh();
  const slideshow = useSlideshow();
  const pendingShuffle = useRef(false);

  /* Clear slideshow when entering liked browse mode. */
  useEffect(() => { slideshow.stop(); }, []);  // eslint-disable-line react-hooks/exhaustive-deps

  const [likedMedia, setLikedMedia] = useState([]);
  const [loading, setLoading] = useState(true);

  /* Fetch liked media on mount and when refresh signal changes. */
  useEffect(() => {
    let cancelled = false;
    fetchMedia({ liked: true })
      .then(({ items }) => { if (!cancelled) { setLikedMedia(items); setLoading(false); } })
      .catch(err => { console.error('Failed to fetch liked media:', err); if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [signal]);

  const handleMediaClick = (clickedMedia) => {
    navigate(`/media/${clickedMedia.id}`);
  };

  const handleShuffle = () => {
    if (likedMedia.length === 0) return;
    pendingShuffle.current = true;
    slideshow.start(likedMedia, { order: 'random' });
  };

  useEffect(() => {
    if (pendingShuffle.current && slideshow.active && slideshow.current) {
      pendingShuffle.current = false;
      navigate(`/media/${slideshow.current.id}`);
    }
  }, [slideshow.active, slideshow.current, navigate]);

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
          <p className="text-gray-400 text-sm">{likedMedia.length} items</p>
        </div>
        {likedMedia.length > 0 && (
          <Button variant="secondary" onClick={handleShuffle}>
            Shuffle
          </Button>
        )}
      </div>

      {/* Media Grid or Empty State */}
      <MediaGrid
        items={likedMedia}
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
