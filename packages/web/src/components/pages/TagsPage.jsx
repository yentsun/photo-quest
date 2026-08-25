import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { fetchTags, getLastTags } from '../../utils/api.js';
import { EmptyState } from '../layout/index.js';
import { Button, Icon, Loader } from '../ui/index.js';
import { TagCard } from '../media/index.js';
import useSwipePagination from '../../hooks/useSwipePagination.js';

const PAGE_SIZE = 30;

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

export default function TagsPage() {
  const cached = getLastTags();
  const [tags, setTags] = useState(cached ?? []);
  const [loading, setLoading] = useState(!cached);
  const [searchParams, setSearchParams] = useSearchParams();
  const paramPage = Math.max(1, parseInt(searchParams.get('page'), 10) || 1);
  const page = paramPage - 1;

  const goToPage = useCallback((p) => {
    if (p === 0) { setSearchParams({}, { replace: true }); return; }
    setSearchParams({ page: String(p + 1) });
  }, [setSearchParams]);

  useEffect(() => {
    fetchTags()
      .then(data => { setTags(data); setLoading(false); })
      .catch(err => { console.error('Failed to fetch tags:', err); if (!cached) setLoading(false); });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const totalPages = Math.max(1, Math.ceil(tags.length / PAGE_SIZE));
  const displayPage = Math.min(page, totalPages - 1);
  const displayTags = tags.slice(displayPage * PAGE_SIZE, (displayPage + 1) * PAGE_SIZE);

  /* Keep the URL page in range when the tag count changes. */
  useEffect(() => {
    if (displayPage !== page) goToPage(displayPage);
  }, [displayPage, page, goToPage]);

  useEffect(() => {
    document.querySelector('.page')?.scrollTo({ top: 0, behavior: 'instant' });
  }, [displayPage]);

  const swipe = useSwipePagination({
    onPrev: () => { if (displayPage > 0) goToPage(displayPage - 1); },
    onNext: () => { if (displayPage < totalPages - 1) goToPage(displayPage + 1); },
  });

  if (loading) return <div className="page-loader"><Loader message="tags…" /></div>;

  return (
    <div className="page" {...swipe}>
      <div className="page-header">
        <div>
          <h1 className="page-title">Tags</h1>
          <p className="page-subtitle">{tags.length} tag{tags.length !== 1 ? 's' : ''}</p>
        </div>
      </div>

      {tags.length === 0 ? (
        <EmptyState
          icon={<Icon name="list" className="icon-2xl" />}
          title="No tags yet"
          description="Open any photo or video and click '+ tag' to start tagging."
        />
      ) : (
        <>
          <div className="item-grid">
            {displayTags.map(({ tag, count, previewMediaId, previewThumbnailTime }) => (
              <TagCard key={tag} tag={tag} count={count} previewMediaId={previewMediaId} previewThumbnailTime={previewThumbnailTime} />
            ))}
          </div>

          {totalPages > 1 && (
            <div className="pagination-row">
              <Button variant="ghost" size="sm" disabled={displayPage === 0} onClick={() => goToPage(displayPage - 1)} icon={<Icon name="prev" className="icon-sm" />} />
              {getPageNumbers(displayPage, totalPages).map((p, i) =>
                p === '…'
                  ? <span key={`ellipsis-${i}`} className="pagination-ellipsis">…</span>
                  : <Button key={p} variant={p === displayPage ? 'primary' : 'ghost'} size="sm" onClick={() => goToPage(p)}>{p + 1}</Button>
              )}
              <Button variant="ghost" size="sm" disabled={displayPage >= totalPages - 1} onClick={() => goToPage(displayPage + 1)} icon={<Icon name="next" className="icon-sm" />} />
            </div>
          )}
        </>
      )}
    </div>
  );
}
