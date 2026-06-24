import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMediaActions } from '../../hooks/useMedia.js';
import { useRefresh } from '../../contexts/RefreshContext.jsx';
import { useSlideshow } from '../../contexts/SlideshowContext.jsx';
import { fetchMedia } from '../../utils/api.js';
import { getPageCache, setPageCache, isPageCacheValid } from '../../utils/pageCache.js';
import { idbGetMedia } from '../../services/idb.js';
import { MediaGrid } from '../media/index.js';
import { EmptyState } from '../layout/index.js';
import { Button, Icon, Loader } from '../ui/index.js';

const PAGE_SIZE = 200;

export default function LikedPage() {
  const navigate = useNavigate();
  const { likeMedia } = useMediaActions();
  const { signal } = useRefresh();
  const slideshow = useSlideshow();
  const pendingShuffle = useRef(false);

  useEffect(() => { slideshow.stop(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const _pc = isPageCacheValid('liked', signal) ? getPageCache('liked') : null;

  const [likedMedia, setLikedMedia] = useState(_pc?.data.likedMedia ?? []);
  const [total, setTotal] = useState(_pc?.data.total ?? 0);
  const [loading, setLoading] = useState(!_pc);
  const [loadingMore, setLoadingMore] = useState(false);
  const offsetRef = useRef(_pc?.data.offset ?? 0);
  const totalRef = useRef(_pc?.data.total ?? 0);
  const loadingMoreRef = useRef(false);

  useEffect(() => {
    if (isPageCacheValid('liked', signal)) return;
    let cancelled = false;
    offsetRef.current = 0;
    totalRef.current = 0;

    idbGetMedia({ liked: true, limit: PAGE_SIZE })
      .then(({ items }) => {
        if (!cancelled && items.length > 0 && likedMedia.length === 0) { setLikedMedia(items); setLoading(false); }
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
        setPageCache('liked', { likedMedia: items, total: t, offset: items.length }, signal);
      })
      .catch(err => { console.error('Failed to fetch liked media:', err); if (!cancelled) setLoading(false); });

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
    } catch (err) { console.error('Failed to load more liked media:', err); }
    finally { loadingMoreRef.current = false; setLoadingMore(false); }
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

  if (loading) return <div className="page-loader"><Loader message="Fetching your liked media…" /></div>;

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Liked</h1>
          <p className="page-subtitle">{total} item{total !== 1 ? 's' : ''}</p>
        </div>
        {likedMedia.length > 0 && (
          <Button variant="ghost" size="sm" onClick={handleShuffle} icon={<Icon name="shuffle" className="icon-sm" />}>
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
            icon={<Icon name="heart" className="icon-2xl" />}
            title="No liked items"
            description="Like photos and videos in your library to see them here."
          />
        }
      />

      {loadingMore && (
        <div className="loading-row">
          <span className="spinner" />
        </div>
      )}
    </div>
  );
}
