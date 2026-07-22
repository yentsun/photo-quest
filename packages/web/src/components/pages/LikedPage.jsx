import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useMediaActions } from '../../hooks/useMedia.js';
import { useRefresh } from '../../contexts/RefreshContext.jsx';
import { useSlideshow } from '../../contexts/SlideshowContext.jsx';
import { fetchMedia } from '../../utils/api.js';
import { getPageCache, setPageCache, isPageCacheValid } from '../../utils/pageCache.js';
import { idbGetMedia } from '../../services/idb.js';
import { MediaGrid } from '../media/index.js';
import { EmptyState } from '../layout/index.js';
import { Button, Icon, Loader } from '../ui/index.js';

const PAGE_SIZE = 30;
const FETCH_LIMIT = 10000;

function getPageNumbers(current, total) {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i);
  const set = new Set([0, total - 1, current]);
  for (let i = Math.max(0, current - 2); i <= Math.min(total - 1, current + 2); i++) set.add(i);
  const sorted = [...set].sort((a, b) => a - b);
  const result = [];
  for (let i = 0; i < sorted.length; i++) {
    if (i > 0 && sorted[i] - sorted[i - 1] > 1) result.push('…');
    result.push(sorted[i]);
  }
  return result;
}

export default function LikedPage() {
  const navigate = useNavigate();
  const { likeMedia } = useMediaActions();
  const { signal } = useRefresh();
  const slideshow = useSlideshow();
  const pendingShuffle = useRef(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const page = Math.max(0, parseInt(searchParams.get('page'), 10) || 0);

  const goToPage = useCallback((p) => {
    if (p === 0) { setSearchParams({}, { replace: true }); return; }
    setSearchParams({ page: String(p) });
  }, [setSearchParams]);

  useEffect(() => { slideshow.stop(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const _pc = isPageCacheValid('liked', signal) ? getPageCache('liked') : null;

  const [likedMedia, setLikedMedia] = useState(_pc?.data.likedMedia ?? []);
  const [total, setTotal] = useState(_pc?.data.total ?? 0);
  const [loading, setLoading] = useState(!_pc);

  useEffect(() => {
    if (isPageCacheValid('liked', signal)) return;
    let cancelled = false;

    idbGetMedia({ liked: true, limit: FETCH_LIMIT })
      .then(({ items }) => {
        if (!cancelled && items.length > 0 && likedMedia.length === 0) { setLikedMedia(items); setLoading(false); }
      })
      .catch(() => {});

    fetchMedia({ liked: true, limit: FETCH_LIMIT })
      .then(({ items, total: t }) => {
        if (cancelled) return;
        setLikedMedia(items);
        setTotal(t);
        setLoading(false);
        setPageCache('liked', { likedMedia: items, total: t }, signal);
      })
      .catch(err => { console.error('Failed to fetch liked media:', err); if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [signal]); // eslint-disable-line react-hooks/exhaustive-deps

  const totalPages = Math.max(1, Math.ceil(likedMedia.length / PAGE_SIZE));
  const displayItems = useMemo(() => likedMedia.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE), [likedMedia, page]);

  const handleShuffle = () => {
    if (likedMedia.length === 0) return;
    pendingShuffle.current = true;
    slideshow.start(likedMedia, { order: 'random', total });
  };

  useEffect(() => {
    if (pendingShuffle.current && slideshow.active && slideshow.current) {
      pendingShuffle.current = false;
      navigate(`/media/${slideshow.current.id}`);
    }
  }, [slideshow.active, slideshow.current, navigate]);

  const itemLabel = (() => {
    if (total === 0) return null;
    if (totalPages <= 1) return `${total.toLocaleString()} item${total !== 1 ? 's' : ''}`;
    const start = page * PAGE_SIZE + 1;
    const end = Math.min((page + 1) * PAGE_SIZE, likedMedia.length);
    return `${start.toLocaleString()}–${end.toLocaleString()} of ${total.toLocaleString()} items`;
  })();

  if (loading) return <div className="page-loader"><Loader message="Fetching your liked media…" /></div>;

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Liked</h1>
          <p className="page-subtitle">{itemLabel || '0 items'}</p>
        </div>
        {likedMedia.length > 0 && (
          <Button variant="ghost" size="sm" onClick={handleShuffle} icon={<Icon name="shuffle" className="icon-sm" />}>
            Shuffle
          </Button>
        )}
      </div>

      <MediaGrid
        items={displayItems}
        onItemClick={m => navigate(`/media/${m.id}`)}
        onItemLike={likeMedia}
        emptyState={
          <EmptyState
            icon={<Icon name="heart" className="icon-2xl" />}
            title="No liked items"
            description="Like photos and videos in your library to see them here."
          />
        }
      />

      {totalPages > 1 && (
        <div className="pagination-row">
          <Button variant="ghost" size="sm" disabled={page === 0} onClick={() => goToPage(page - 1)} icon={<Icon name="prev" className="icon-sm" />} />
          {getPageNumbers(page, totalPages).map((p, i) =>
            p === '…'
              ? <span key={`ellipsis-${i}`} className="pagination-ellipsis">…</span>
              : <Button key={p} variant={p === page ? 'primary' : 'ghost'} size="sm" onClick={() => goToPage(p)}>{p + 1}</Button>
          )}
          <Button variant="ghost" size="sm" disabled={page >= totalPages - 1} onClick={() => goToPage(page + 1)} icon={<Icon name="next" className="icon-sm" />} />
        </div>
      )}
    </div>
  );
}
