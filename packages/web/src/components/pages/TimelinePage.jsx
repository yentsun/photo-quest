/**
 * @file Timeline page -- the whole library, newest first, grouped by day.
 *
 * Pages are fetched from the server in date order (`limit`/`offset`) and the
 * next page loads automatically when the bottom sentinel scrolls into view.
 * The date filter is applied server-side via `from`/`to`, so an empty or
 * narrow range never downloads the whole library.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useRefresh } from '../../contexts/RefreshContext.jsx';
import { fetchMedia } from '../../utils/api.js';
import { getPageCache, isPageCacheValid, setPageCache } from '../../utils/pageCache.js';
import { formatDayLabel, groupMediaByDay } from '../../utils/timeline.js';
import { MediaGrid } from '../media/index.js';
import { EmptyState } from '../layout/index.js';
import { DateRangePicker, Icon, Loader } from '../ui/index.js';

const PAGE_SIZE = 60;

export default function TimelinePage() {
  const navigate = useNavigate();
  const { signal } = useRefresh();

  /* Keep the loaded pages and range when the user opens an item and comes
     back. A stale signal (media changed) keeps the range but refetches. */
  const previousCache = getPageCache('timeline')?.data;
  const validCache = isPageCacheValid('timeline', signal) ? previousCache : null;
  const [range, setRange] = useState(previousCache?.range ?? { start: null, end: null });
  const [items, setItems] = useState(validCache?.items ?? []);
  const [total, setTotal] = useState(validCache?.total ?? 0);
  const [loading, setLoading] = useState(!validCache);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(null);

  const offsetRef = useRef(validCache?.items.length ?? 0);
  const loadingMoreRef = useRef(false);
  const requestRef = useRef(0);
  const skipInitialFetchRef = useRef(Boolean(validCache));

  const { start: from, end: to } = range;

  useEffect(() => {
    if (skipInitialFetchRef.current) {
      skipInitialFetchRef.current = false;
      return undefined;
    }

    let cancelled = false;
    const requestId = requestRef.current + 1;
    requestRef.current = requestId;

    setLoading(true);
    setError(null);
    setItems([]);
    setTotal(0);
    offsetRef.current = 0;
    loadingMoreRef.current = false;
    setLoadingMore(false);

    fetchMedia({ limit: PAGE_SIZE, offset: 0, from, to, skipCache: true })
      .then((data) => {
        if (cancelled || requestId !== requestRef.current) return;
        setItems(data.items);
        setTotal(data.total);
        offsetRef.current = data.items.length;
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [from, to, signal]);

  const loadMore = useCallback(() => {
    if (loadingMoreRef.current) return;
    if (offsetRef.current >= total) return;

    loadingMoreRef.current = true;
    setLoadingMore(true);

    const requestId = requestRef.current;
    const offset = offsetRef.current;

    fetchMedia({ limit: PAGE_SIZE, offset, from, to, skipCache: true })
      .then((data) => {
        if (requestId !== requestRef.current) return;

        offsetRef.current = offset + data.items.length;
        setItems((previous) => {
          const seen = new Set(previous.map(item => item.id));
          const fresh = data.items.filter(item => !seen.has(item.id));
          return fresh.length > 0 ? [...previous, ...fresh] : previous;
        });

        /* A short page with a stale `total` would otherwise make the sentinel
           keep requesting the same empty offset forever. */
        setTotal(data.items.length === 0 ? offset : data.total);
      })
      .catch((err) => console.error('Failed to load the next timeline page:', err))
      .finally(() => {
        loadingMoreRef.current = false;
        setLoadingMore(false);
      });
  }, [from, to, total]);

  useEffect(() => {
    if (loading || error) return;
    setPageCache('timeline', { range, items, total }, signal);
  }, [range, items, total, loading, error, signal]);

  const handleRangeChange = useCallback((next) => {
    setRange(next);
    document.querySelector('.page')?.scrollTo({ top: 0, behavior: 'instant' });
  }, []);

  const openItem = useCallback((media) => {
    navigate(`/media/${media.id}`, { state: { context: 'timeline' } });
  }, [navigate]);

  const sections = useMemo(() => groupMediaByDay(items).map(group => ({
    key: group.key,
    title: formatDayLabel(group.key),
    meta: `${group.items.length.toLocaleString()} item${group.items.length === 1 ? '' : 's'}`,
    items: group.items,
  })), [items]);

  const hasMore = items.length < total;
  const subtitle = loading
    ? 'Loading…'
    : error
      ? 'Could not load'
      : total === 0
        ? 'No items'
        : hasMore
          ? `${items.length.toLocaleString()} of ${total.toLocaleString()} items`
          : `${total.toLocaleString()} item${total === 1 ? '' : 's'}`;

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Timeline</h1>
          <p className="page-subtitle">{subtitle}</p>
        </div>
        <div className="page-actions">
          <DateRangePicker
            start={from}
            end={to}
            onChange={handleRangeChange}
          />
        </div>
      </div>

      {loading && items.length === 0 ? (
        <div className="page-loader"><Loader message="Building your timeline…" /></div>
      ) : error ? (
        <EmptyState
          icon={<Icon name="warning" className="icon-2xl" />}
          title="Could not load timeline"
          description={error}
        />
      ) : (
        <MediaGrid
          sections={sections}
          onItemClick={openItem}
          onNearEnd={hasMore ? loadMore : undefined}
          loadingMore={loadingMore}
          emptyState={
            <EmptyState
              icon={<Icon name="calendar" className="icon-2xl" />}
              title={from ? 'No media in this range' : 'No media yet'}
              description={from
                ? 'Try a wider date range.'
                : 'Import a folder to see your photos and videos here.'}
              action={from ? {
                label: 'Clear date range',
                onClick: () => handleRangeChange({ start: null, end: null }),
              } : undefined}
            />
          }
        />
      )}
    </div>
  );
}
