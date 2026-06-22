/**
 * @file Liked media page - shows items with likes > 0.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMediaActions } from '../../hooks/useMedia.js';
import { useRefresh } from '../../contexts/RefreshContext.jsx';
import { useSlideshow } from '../../contexts/SlideshowContext.jsx';
import { fetchMedia } from '../../utils/api.js';
import { idbGetMedia } from '../../services/idb.js';
import { MediaGrid } from '../media/index.js';
import { EmptyState } from '../layout/index.js';
import { Button, Icon, PageLoader, Spinner } from '../ui/index.js';

const PAGE_SIZE = 200;

export default function LikedPage() {
  const navigate = useNavigate();
  const { likeMedia } = useMediaActions();
  const { signal } = useRefresh();
  const slideshow = useSlideshow();
  const pendingShuffle = useRef(false);

  useEffect(() => { slideshow.stop(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const [likedMedia, setLikedMedia] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const offsetRef = useRef(0);
  const totalRef = useRef(0);
  const loadingMoreRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    offsetRef.current = 0;
    totalRef.current = 0;

    /* IDB-first: show cached items instantly on return visits (first load only). */
    idbGetMedia({ liked: true, limit: PAGE_SIZE })
      .then(({ items }) => {
        if (!cancelled && items.length > 0 && likedMedia.length === 0) {
          setLikedMedia(items);
          setLoading(false);
        }
      })
      .catch(() => {});

    fetchMedia({ liked: true, limit: PAGE_SIZE, offset: 0 })
      .then(({ items, total: t }) => {
        if (cancelled) return;
        offsetRef.current = items.length;
        totalRef.current = t;
        setLikedMedia(items);
        setTotal(t);
        setLoading(false);
      })
      .catch(err => {
        console.error('Failed to fetch liked media:', err);
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [signal]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleLoadMore = useCallback(async () => {
    if (loadingMoreRef.current) return;
    if (offsetRef.current >= totalRef.current) return;

    loadingMoreRef.current = true;
    setLoadingMore(true);
    try {
      const { items: more } = await fetchMedia({ liked: true, limit: PAGE_SIZE, offset: offsetRef.current });
      if (more.length > 0) {
        offsetRef.current += more.length;
        setLikedMedia(prev => {
          const existingIds = new Set(prev.map(m => m.id));
          return [...prev, ...more.filter(m => !existingIds.has(m.id))];
        });
      }
    } catch (err) {
      console.error('Failed to load more liked media:', err);
    } finally {
      loadingMoreRef.current = false;
      setLoadingMore(false);
    }
  }, []);

  const handleShuffle = () => {
    if (likedMedia.length === 0) return;
    pendingShuffle.current = true;
    slideshow.start(likedMedia, {
      order: 'random',
      total,
      loadMore: () => fetchMedia({ liked: true, limit: PAGE_SIZE, offset: likedMedia.length }).then(d => d.items),
    });
  };

  useEffect(() => {
    if (pendingShuffle.current && slideshow.active && slideshow.current) {
      pendingShuffle.current = false;
      navigate(`/media/${slideshow.current.id}`);
    }
  }, [slideshow.active, slideshow.current, navigate]);

  if (loading) {
    return <PageLoader message="Fetching your liked media…" />;
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Liked</h1>
          <p className="text-gray-400 text-sm">{total} item{total !== 1 ? 's' : ''}</p>
        </div>
        {likedMedia.length > 0 && (
          <Button variant="secondary" onClick={handleShuffle}>
            Shuffle
          </Button>
        )}
      </div>

      <MediaGrid
        items={likedMedia}
        onItemClick={m => navigate(`/media/${m.id}`)}
        onItemLike={likeMedia}
        onNearEnd={likedMedia.length < total ? handleLoadMore : undefined}
        emptyState={
          <EmptyState
            icon={<Icon name="heart" className="w-16 h-16" />}
            title="No liked items"
            description="Like photos and videos in your library to see them here."
          />
        }
      />

      {loadingMore && (
        <div className="flex justify-center py-6">
          <Spinner />
        </div>
      )}
    </div>
  );
}
