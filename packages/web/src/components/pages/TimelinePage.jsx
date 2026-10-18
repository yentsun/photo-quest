/**
 * @file Timeline page -- the whole library grouped by day.
 *
 * Day totals come from `/media?days=1`; each day's items load independently
 * (60 at a time) when its section scrolls near the viewport. Collapsing a day
 * removes its sentinel, so the next day's section starts loading immediately.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useRefresh } from '../../contexts/RefreshContext.jsx';
import { fetchMedia, fetchMediaDays } from '../../utils/api.js';
import { getPageCache, isPageCacheValid, setPageCache } from '../../utils/pageCache.js';
import { formatDayLabel } from '../../utils/timeline.js';
import { MediaGrid } from '../media/index.js';
import { EmptyState } from '../layout/index.js';
import { DateRangePicker, Icon, Loader, Select } from '../ui/index.js';

const PAGE_SIZE = 60;
const EMPTY_RANGE = { start: null, end: null };

export default function TimelinePage() {
  const navigate = useNavigate();
  const { signal, libraryCount } = useRefresh();

  /* Keep loaded days and the filter when opening an item and coming back. */
  const previousCache = getPageCache('timeline')?.data;
  const validCache = isPageCacheValid('timeline', signal) ? previousCache : null;

  const [range, setRange] = useState(previousCache?.range ?? EMPTY_RANGE);
  const [mediaType, setMediaType] = useState(previousCache?.type ?? 'all');
  const [days, setDays] = useState(validCache?.days ?? []);
  const [dayItems, setDayItems] = useState(validCache?.dayItems ?? {});
  const [collapsedDays, setCollapsedDays] = useState(() => new Set(previousCache?.collapsedDays ?? []));
  const [loadingDays, setLoadingDays] = useState(() => new Set());
  const [loading, setLoading] = useState(!validCache);
  const [error, setError] = useState(null);

  const dayOffsetsRef = useRef(validCache?.dayOffsets ?? {});
  const loadingDaysRef = useRef(new Set());
  const requestRef = useRef(0);
  const skipInitialCountsRef = useRef(Boolean(validCache));

  const { start: from, end: to } = range;
  const typeParam = mediaType === 'all' ? undefined : mediaType;

  useEffect(() => {
    if (skipInitialCountsRef.current) {
      skipInitialCountsRef.current = false;
      return undefined;
    }

    let cancelled = false;
    const requestId = requestRef.current + 1;
    requestRef.current = requestId;

    setLoading(true);
    setError(null);
    setDays([]);
    setDayItems({});
    dayOffsetsRef.current = {};
    loadingDaysRef.current = new Set();
    setLoadingDays(new Set());

    fetchMediaDays({ from, to, type: typeParam })
      .then((rows) => {
        if (cancelled || requestId !== requestRef.current) return;
        setDays(rows.map(row => ({ key: row.day, count: row.count })));
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [from, to, typeParam, signal]);

  const loadDay = useCallback(async (key) => {
    if (loadingDaysRef.current.has(key)) return;

    const day = days.find(entry => entry.key === key);
    if (!day) return;

    const offset = dayOffsetsRef.current[key] ?? 0;
    if (offset >= day.count) return;

    const requestId = requestRef.current;
    loadingDaysRef.current.add(key);
    setLoadingDays(new Set(loadingDaysRef.current));

    try {
      const data = await fetchMedia({
        from: key,
        to: key,
        type: typeParam,
        limit: PAGE_SIZE,
        offset,
        skipCache: true,
      });
      if (requestId !== requestRef.current) return;

      setDayItems((previous) => {
        const existing = previous[key] ?? [];
        const seen = new Set(existing.map(item => item.id));
        const fresh = data.items.filter(item => !seen.has(item.id));
        return fresh.length > 0 ? { ...previous, [key]: [...existing, ...fresh] } : previous;
      });
      dayOffsetsRef.current[key] = offset + data.items.length;

      if (data.total !== day.count) {
        setDays(previous => previous.map(entry => (
          entry.key === key ? { ...entry, count: data.total } : entry
        )));
      }
    } catch (err) {
      console.error('Failed to load timeline day:', err);
    } finally {
      if (requestId === requestRef.current) {
        loadingDaysRef.current.delete(key);
        setLoadingDays(new Set(loadingDaysRef.current));
      }
    }
  }, [days, typeParam]);

  useEffect(() => {
    if (loading || error) return;
    setPageCache('timeline', {
      range,
      type: mediaType,
      days,
      dayItems,
      dayOffsets: dayOffsetsRef.current,
      collapsedDays: [...collapsedDays],
    }, signal);
  }, [range, mediaType, days, dayItems, collapsedDays, loading, error, signal]);

  const handleRangeChange = useCallback((next) => {
    setRange(next);
    setDays([]);
    setDayItems({});
    dayOffsetsRef.current = {};
    setLoading(true);
    document.querySelector('.page')?.scrollTo({ top: 0, behavior: 'instant' });
  }, []);

  const handleTypeChange = useCallback((next) => {
    if (next === mediaType) return;
    setMediaType(next);
    setDays([]);
    setDayItems({});
    dayOffsetsRef.current = {};
    setLoading(true);
    document.querySelector('.page')?.scrollTo({ top: 0, behavior: 'instant' });
  }, [mediaType]);

  const toggleDay = useCallback((key) => {
    setCollapsedDays((previous) => {
      const next = new Set(previous);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const clearFilters = () => {
    setRange(EMPTY_RANGE);
    setMediaType('all');
    setDays([]);
    setDayItems({});
    dayOffsetsRef.current = {};
    setLoading(true);
  };

  const openItem = useCallback((media) => {
    navigate(`/media/${media.id}`, { state: { context: 'timeline' } });
  }, [navigate]);

  const labels = useMemo(
    () => Object.fromEntries(days.map(day => [day.key, formatDayLabel(day.key)])),
    [days],
  );

  const sections = useMemo(() => days.map((day) => {
    const items = dayItems[day.key] ?? [];
    return {
      key: day.key,
      title: labels[day.key],
      meta: `${day.count.toLocaleString()} item${day.count === 1 ? '' : 's'}`,
      items,
      collapsed: collapsedDays.has(day.key),
      hasMore: items.length < day.count,
      loadingMore: loadingDays.has(day.key),
      onLoadMore: () => loadDay(day.key),
    };
  }), [days, dayItems, labels, collapsedDays, loadingDays, loadDay]);

  const filteredTotal = useMemo(
    () => days.reduce((sum, day) => sum + day.count, 0),
    [days],
  );
  const filtersApplied = Boolean(from || to) || mediaType !== 'all';
  const subtitle = loading
    ? 'Loading…'
    : error
      ? 'Could not load'
      : filteredTotal === 0
        ? 'No items'
        : filtersApplied && libraryCount != null
          ? `${filteredTotal.toLocaleString()} of ${libraryCount.toLocaleString()} items`
          : `${filteredTotal.toLocaleString()} item${filteredTotal === 1 ? '' : 's'}`;

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Timeline</h1>
          <p className="page-subtitle">{subtitle}</p>
        </div>
        <div className="page-actions">
          <Select
            value={mediaType}
            onChange={e => handleTypeChange(e.target.value)}
            options={[
              { value: 'all', label: 'All' },
              { value: 'image', label: 'Photos' },
              { value: 'video', label: 'Videos' },
            ]}
            title="Media type"
          />
          <DateRangePicker
            start={from}
            end={to}
            onChange={handleRangeChange}
          />
        </div>
      </div>

      {loading ? (
        <div className="page-loader"><Loader message="Building your timeline…" /></div>
      ) : error ? (
        <EmptyState
          icon={<Icon name="warning" className="icon-2xl" />}
          title="Could not load timeline"
          description={error}
        />
      ) : days.length === 0 ? (
        <EmptyState
          icon={<Icon name="calendar" className="icon-2xl" />}
          title={filtersApplied ? 'No matching media' : 'No media yet'}
          description={filtersApplied
            ? 'Try a wider date range or a different media type.'
            : 'Import a folder to see your photos and videos here.'}
          action={filtersApplied ? {
            label: 'Clear filters',
            onClick: clearFilters,
          } : undefined}
        />
      ) : (
        <MediaGrid
          sections={sections}
          onItemClick={openItem}
          onToggleSection={toggleDay}
        />
      )}
    </div>
  );
}
