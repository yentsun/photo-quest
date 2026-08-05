import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useMediaActions } from '../../hooks/useMedia.js';
import { useRefresh } from '../../contexts/RefreshContext.jsx';
import { useSlideshow } from '../../contexts/SlideshowContext.jsx';
import { fetchMedia } from '../../utils/api.js';
import { MediaGrid } from '../media/index.js';
import { EmptyState } from '../layout/index.js';
import { Button, Icon, Loader } from '../ui/index.js';

const PAGE_SIZE = 30;

function getPageNumbers(current, total) {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i);
  const set = new Set([0, total - 1, current]);
  for (let i = Math.max(0, current - 2); i <= Math.min(total - 1, current + 2); i++) set.add(i);
  const sorted = [...set].sort((a, b) => a - b);
  const result = [];
  for (let i = 0; i < sorted.length; i++) {
    if (i > 0 && sorted[i] - sorted[i - 1] > 1) result.push('...');
    result.push(sorted[i]);
  }
  return result;
}

export default function TagPage() {
  const { tag } = useParams();
  const navigate = useNavigate();
  const { likeMedia } = useMediaActions();
  const { signal } = useRefresh();
  const slideshow = useSlideshow();
  const pendingShuffle = useRef(false);

  useEffect(() => { slideshow.stop(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const decodedTag = decodeURIComponent(tag);

  const [media, setMedia] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  const [searchParams, setSearchParams] = useSearchParams();
  const paramPage = Math.max(1, parseInt(searchParams.get('page'), 10) || 1);
  const page = paramPage - 1;

  const goToPage = useCallback((p) => {
    if (p === 0) { setSearchParams({}, { replace: true }); return; }
    setSearchParams({ page: String(p + 1) });
  }, [setSearchParams]);

  useEffect(() => {
    document.querySelector('.page')?.scrollTo({ top: 0, behavior: 'instant' });
  }, [page]);

  const prevDecodedTag = useRef(decodedTag);
  useEffect(() => {
    if (prevDecodedTag.current !== decodedTag) goToPage(0);
    prevDecodedTag.current = decodedTag;
  }, [decodedTag]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchMedia({ tag: decodedTag, limit: PAGE_SIZE, offset: page * PAGE_SIZE })
      .then(({ items, total: t }) => {
        if (cancelled) return;
        setMedia(items);
        setTotal(t);
        setLoading(false);
      })
      .catch(err => { console.error('Failed to fetch tagged media:', err); if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [decodedTag, page, signal]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const itemLabel = (() => {
    if (total === 0) return null;
    if (totalPages <= 1) return `${total} item${total !== 1 ? 's' : ''}`;
    const start = page * PAGE_SIZE + 1;
    const end = Math.min((page + 1) * PAGE_SIZE, total);
    return `${start}–${end} of ${total} items`;
  })();

  const handleShuffle = () => {
    if (media.length === 0) return;
    pendingShuffle.current = true;
    slideshow.start(media, { order: 'random', total: media.length });
  };

  useEffect(() => {
    if (pendingShuffle.current && slideshow.active && slideshow.current) {
      pendingShuffle.current = false;
      navigate(`/media/${slideshow.current.id}`);
    }
  }, [slideshow.active, slideshow.current, navigate]);

  if (loading) return <div className="page-loader"><Loader message={`"${decodedTag}"...`} /></div>;

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
            <Button variant="text" onClick={() => navigate('/tags')}>Tags</Button>
            <span className="breadcrumb-sep">/</span>
            <h1 className="page-title">{decodedTag}</h1>
          </div>
          <p className="page-subtitle">{itemLabel || '0 items'}</p>
        </div>
        {total > 0 && (
          <Button variant="ghost" size="sm" onClick={handleShuffle} icon={<Icon name="shuffle" className="icon-sm" />}>
            Shuffle
          </Button>
        )}
      </div>

      {media.length > 0 ? (
        <>
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
          {totalPages > 1 && (
            <div className="pagination-row">
              <Button variant="ghost" size="sm" disabled={page === 0} onClick={() => goToPage(page - 1)} icon={<Icon name="prev" className="icon-sm" />} />
              {getPageNumbers(page, totalPages).map((p, i) =>
                p === '...'
                  ? <span key={`ellipsis-${i}`} className="pagination-ellipsis">...</span>
                  : <Button key={p} variant={p === page ? 'primary' : 'ghost'} size="sm" onClick={() => goToPage(p)}>{p + 1}</Button>
              )}
              <Button variant="ghost" size="sm" disabled={page >= totalPages - 1} onClick={() => goToPage(page + 1)} icon={<Icon name="next" className="icon-sm" />} />
            </div>
          )}
        </>
      ) : (
        <EmptyState
          icon={<Icon name="list" className="icon-2xl" />}
          title={`No media tagged "${decodedTag}"`}
          description="Tag items from the media viewer."
        />
      )}
    </div>
  );
}
