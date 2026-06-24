import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useMediaActions } from '../../hooks/useMedia.js';
import { useRefresh } from '../../contexts/RefreshContext.jsx';
import { useSlideshow } from '../../contexts/SlideshowContext.jsx';
import { fetchMedia } from '../../utils/api.js';
import { getPageCache, setPageCache, isPageCacheValid } from '../../utils/pageCache.js';
import { MediaGrid } from '../media/index.js';
import { EmptyState } from '../layout/index.js';
import { Button, Icon, Loader } from '../ui/index.js';

export default function TagPage() {
  const { tag } = useParams();
  const navigate = useNavigate();
  const { likeMedia } = useMediaActions();
  const { signal } = useRefresh();
  const slideshow = useSlideshow();
  const pendingShuffle = useRef(false);

  useEffect(() => { slideshow.stop(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const decodedTag = decodeURIComponent(tag);
  const CACHE_KEY = `tag:${decodedTag}`;
  const _pc = isPageCacheValid(CACHE_KEY, signal) ? getPageCache(CACHE_KEY) : null;

  const [media, setMedia] = useState(_pc?.data.media ?? []);
  const [total, setTotal] = useState(_pc?.data.total ?? 0);
  const [loading, setLoading] = useState(!_pc);

  useEffect(() => {
    if (isPageCacheValid(CACHE_KEY, signal)) return;
    let cancelled = false;
    setLoading(true);
    fetchMedia({ tag: decodedTag })
      .then(({ items, total: t }) => {
        if (cancelled) return;
        setMedia(items);
        setTotal(t);
        setLoading(false);
        setPageCache(CACHE_KEY, { media: items, total: t }, signal);
      })
      .catch(err => { console.error('Failed to fetch tagged media:', err); if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [decodedTag, signal]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleShuffle = () => {
    if (media.length === 0) return;
    pendingShuffle.current = true;
    slideshow.start(media, { order: 'random', total });
  };

  useEffect(() => {
    if (pendingShuffle.current && slideshow.active && slideshow.current) {
      pendingShuffle.current = false;
      navigate(`/media/${slideshow.current.id}`);
    }
  }, [slideshow.active, slideshow.current, navigate]);

  if (loading) return <div className="page-loader"><Loader message={`"${decodedTag}"…`} /></div>;

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
            <Button variant="text" onClick={() => navigate('/tags')}>Tags</Button>
            <span className="breadcrumb-sep">/</span>
            <h1 className="page-title">{decodedTag}</h1>
          </div>
          <p className="page-subtitle">{total} item{total !== 1 ? 's' : ''}</p>
        </div>
        {media.length > 0 && (
          <Button variant="ghost" size="sm" onClick={handleShuffle} icon={<Icon name="shuffle" className="icon-sm" />}>
            Shuffle
          </Button>
        )}
      </div>

      <MediaGrid
        items={media}
        onItemClick={m => navigate(`/media/${m.id}`)}
        onItemLike={likeMedia}
        emptyState={
          <EmptyState
            icon={<Icon name="list" className="icon-2xl" />}
            title={`No media tagged "${decodedTag}"`}
            description="Tag items from the media viewer."
          />
        }
      />
    </div>
  );
}
