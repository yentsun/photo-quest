/**
 * @file Timeline page -- the whole library grouped by day.
 *
 * Day totals come from `/media?days=1`; each day's items load independently
 * (60 at a time) when its section scrolls near the viewport. Collapsing a day
 * removes its sentinel, so the next day's section starts loading immediately.
 */

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useRefresh } from '../../contexts/RefreshContext.jsx';
import { fetchMedia, fetchMediaDays } from '../../utils/api.js';
import { getPageCache, isPageCacheValid, setPageCache } from '../../utils/pageCache.js';
import { formatDayLabel, UNKNOWN_DAY } from '../../utils/timeline.js';
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
  const [days, setDays] = useState(previousCache?.days ?? []);
  const [dayItems, setDayItems] = useState(previousCache?.dayItems ?? {});
  const [collapsedDays, setCollapsedDays] = useState(() => new Set(previousCache?.collapsedDays ?? []));
  const [visibleDayCount, setVisibleDayCount] = useState(() => {
    if (!previousCache) return 1;
    return previousCache.visibleDayCount
      ?? (Object.keys(previousCache.dayItems ?? {}).length + 1);
  });
  const [loadingDays, setLoadingDays] = useState(() => new Set());
  const [loading, setLoading] = useState(!previousCache);
  const [error, setError] = useState(null);

  const dayOffsetsRef = useRef(previousCache?.dayOffsets ?? {});
  /* Whether the current filters have produced a response yet. Keeps a failed
     background refresh from replacing loaded content with an error state. */
  const daysLoadedRef = useRef(Boolean(previousCache));
  /* key -> token of the request currently loading that day. The token lets a
     superseded response avoid clearing a newer request's flag. */
  const loadingDaysRef = useRef(new Map());
  const requestRef = useRef(0);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  /* The `.page` element is the scroll container. Track its position so a
     return from the media viewer lands on the same spot. */
  const pageRef = useRef(null);
  const scrollTopRef = useRef(previousCache?.scrollTop ?? 0);
  const restoredScrollRef = useRef(false);

  useEffect(() => {
    const element = pageRef.current;
    if (!element) return undefined;
    const onScroll = () => { scrollTopRef.current = element.scrollTop; };
    element.addEventListener('scroll', onScroll, { passive: true });
    return () => element.removeEventListener('scroll', onScroll);
  }, []);

  useLayoutEffect(() => {
    if (restoredScrollRef.current || loading) return;
    const element = pageRef.current;
    if (!element) return;
    if (scrollTopRef.current > 0) element.scrollTop = scrollTopRef.current;
    restoredScrollRef.current = true;
  }, [loading]);

  useEffect(() => () => {
    const cache = getPageCache('timeline');
    if (cache?.data) cache.data.scrollTop = scrollTopRef.current;
  }, []);

  const { start: from, end: to } = range;
  const typeParam = mediaType === 'all' ? undefined : mediaType;

  /* The cache satisfies the initial render; only refetch when a filter or the
     data-change signal actually differs. Comparing values (instead of a
     one-shot flag) also survives StrictMode's double effect run. */
  const lastFiltersRef = useRef(
    previousCache
      ? { from, to, typeParam, signal: validCache ? signal : -1 }
      : null,
  );

  useEffect(() => {
    const previous = lastFiltersRef.current;
    const filtersChanged = !previous
      || previous.from !== from
      || previous.to !== to
      || previous.typeParam !== typeParam;
    const signalChanged = !previous || previous.signal !== signal;
    if (!filtersChanged && !signalChanged) return undefined;
    lastFiltersRef.current = { from, to, typeParam, signal };

    const requestId = requestRef.current + 1;
    requestRef.current = requestId;

    if (filtersChanged) {
      setLoading(true);
      setError(null);
      setDays([]);
      setDayItems({});
      setVisibleDayCount(1);
      dayOffsetsRef.current = {};
      daysLoadedRef.current = false;
      loadingDaysRef.current = new Map();
      setLoadingDays(new Set());
    }

    /* A signal-only run refreshes the day totals in the background without
       throwing away loaded items or the scroll position. */
    fetchMediaDays({ from, to, type: typeParam })
      .then((rows) => {
        if (!mountedRef.current || requestId !== requestRef.current) return;
        daysLoadedRef.current = true;
        setDays(rows.map(row => ({ key: row.day, count: row.count })));
        /* The winning request clears the loader and any stale error: a
           signal-only run can replace the run that reset the filters. */
        setError(null);
        setLoading(false);
      })
      .catch((err) => {
        if (!mountedRef.current || requestId !== requestRef.current) return;
        setLoading(false);
        /* An error state replaces whatever is on screen, so only surface the
           failure when the current filters have no loaded result yet -- e.g. a
           refresh superseded the initial request -- or the user changed them. */
        if (filtersChanged || !daysLoadedRef.current) setError(err.message);
      });

    return undefined;
  }, [from, to, typeParam, signal]);

  const loadDay = useCallback(async (key) => {
    if (loadingDaysRef.current.has(key)) return;

    const day = days.find(entry => entry.key === key);
    if (!day) return;

    const offset = dayOffsetsRef.current[key] ?? 0;
    if (offset >= day.count) return;

    const requestId = requestRef.current;
    const token = {};
    loadingDaysRef.current.set(key, token);
    setLoadingDays(new Set(loadingDaysRef.current.keys()));

    try {
      /* Undated rows have no `from`/`to` bound the server can express, so they
         are paged through the explicit `undated` filter instead. */
      const data = await fetchMedia({
        ...(key === UNKNOWN_DAY ? { undated: true } : { from: key, to: key }),
        type: typeParam,
        limit: PAGE_SIZE,
        offset,
        skipCache: true,
      });
      if (!mountedRef.current || requestId !== requestRef.current) return;

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
      /* Release the key even when a filter or signal change superseded this
         response, otherwise the day would stay marked as loading and could
         never be fetched again. A newer request for the same day owns a
         different token, so its flag is left intact. */
      if (loadingDaysRef.current.get(key) === token) {
        loadingDaysRef.current.delete(key);
        if (mountedRef.current) setLoadingDays(new Set(loadingDaysRef.current.keys()));
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
      dayOffsets: { ...dayOffsetsRef.current },
      collapsedDays: [...collapsedDays],
      visibleDayCount,
      scrollTop: scrollTopRef.current,
    }, signal);
  }, [range, mediaType, days, dayItems, collapsedDays, visibleDayCount, loading, error, signal]);

  const handleRangeChange = useCallback((next) => {
    /* Re-picking the applied range must not clear the page: the fetch effect
       compares values, so an equal range would never re-run it. */
    if ((next?.start ?? null) === from && (next?.end ?? null) === to) return;
    setRange(next);
    setDays([]);
    setDayItems({});
    setVisibleDayCount(1);
    dayOffsetsRef.current = {};
    setLoading(true);
    document.querySelector('.page')?.scrollTo({ top: 0, behavior: 'instant' });
  }, [from, to]);

  const handleTypeChange = useCallback((next) => {
    if (next === mediaType) return;
    setMediaType(next);
    setDays([]);
    setDayItems({});
    setVisibleDayCount(1);
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
    setVisibleDayCount(1);
    dayOffsetsRef.current = {};
    setLoading(true);
  };

  const openItem = useCallback((media) => {
    /* Snapshot the exact visible state at click time, not just the last
       debounced cache write, so returning always restores the same content
       and scroll offset. */
    scrollTopRef.current = pageRef.current?.scrollTop ?? scrollTopRef.current;
    const snapshot = {
      range,
      type: mediaType,
      days,
      dayItems,
      dayOffsets: { ...dayOffsetsRef.current },
      collapsedDays: [...collapsedDays],
      visibleDayCount,
      scrollTop: scrollTopRef.current,
    };
    const cache = getPageCache('timeline');
    if (cache?.data) Object.assign(cache.data, snapshot);
    else setPageCache('timeline', snapshot, signal);

    navigate(`/media/${media.id}`, { state: { context: 'timeline' } });
  }, [navigate, range, mediaType, days, dayItems, collapsedDays, visibleDayCount, signal]);

  const labels = useMemo(
    () => Object.fromEntries(
      days.slice(0, visibleDayCount).map(day => [day.key, formatDayLabel(day.key)]),
    ),
    [days, visibleDayCount],
  );

  const sections = useMemo(() => days.slice(0, visibleDayCount).map((day) => {
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
  }), [days, visibleDayCount, dayItems, labels, collapsedDays, loadingDays, loadDay]);

  const lastSection = sections[sections.length - 1];
  const canExtendDays = visibleDayCount < days.length
    && Boolean(lastSection)
    && (lastSection.items.length > 0 || lastSection.collapsed);

  const loadMoreDays = useCallback(() => {
    setVisibleDayCount(count => Math.min(count + 1, days.length));
  }, [days.length]);

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
    <div className="page" ref={pageRef}>
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
          onNearEnd={canExtendDays ? loadMoreDays : undefined}
        />
      )}
    </div>
  );
}
