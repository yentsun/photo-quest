import { useRef, useEffect } from 'react';
import MediaCard from './MediaCard.jsx';
import { Button, Icon } from '../ui/index.js';

/**
 * Render media as a flat grid, or as titled sections (e.g. Timeline days).
 *
 * `sections` takes precedence over `items`; each section is
 * `{ key, title?, meta?, items, collapsed?, hasMore?, loadingMore?, onLoadMore? }`.
 * `onToggleSection(key)` makes a titled section collapsible. A section with
 * `hasMore` gets its own bottom sentinel that calls `onLoadMore()` when it
 * scrolls near the viewport. The optional top-level `onNearEnd` sentinel is
 * kept for flat, non-sectioned lists.
 */
export default function MediaGrid({
  items = [],
  sections,
  onItemClick,
  onToggleSection,
  emptyState,
  onNearEnd,
  loadingMore = false,
}) {
  const sentinelRef = useRef(null);
  const sectionObserverRef = useRef(null);
  const sectionNodesRef = useRef(new Map());
  const sectionRefCallbacksRef = useRef(new Map());
  const sectionLoadersRef = useRef(new Map());

  useEffect(() => {
    if (!onNearEnd || !sentinelRef.current) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) onNearEnd(); },
      { rootMargin: '400px' }
    );
    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [onNearEnd]);

  useEffect(() => {
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const key = entry.target.dataset.sectionKey;
        sectionLoadersRef.current.get(key)?.();
      }
    }, { rootMargin: '400px' });

    sectionObserverRef.current = observer;
    for (const node of sectionNodesRef.current.values()) observer.observe(node);

    return () => {
      observer.disconnect();
      sectionObserverRef.current = null;
    };
  }, []);

  const groups = sections ?? [{ key: 'all', items }];
  const itemCount = groups.reduce((sum, group) => sum + group.items.length, 0);

  sectionLoadersRef.current = new Map();
  for (const group of groups) {
    if (group.onLoadMore) sectionLoadersRef.current.set(group.key, group.onLoadMore);
  }

  if (itemCount === 0 && emptyState) return emptyState;

  const getSectionSentinelRef = (key) => {
    let callback = sectionRefCallbacksRef.current.get(key);
    if (!callback) {
      callback = (node) => {
        const previous = sectionNodesRef.current.get(key);
        if (previous === node) return;
        if (previous) sectionObserverRef.current?.unobserve(previous);
        if (node) {
          sectionNodesRef.current.set(key, node);
          node.dataset.sectionKey = key;
          sectionObserverRef.current?.observe(node);
        } else {
          sectionNodesRef.current.delete(key);
        }
      };
      sectionRefCallbacksRef.current.set(key, callback);
    }
    return callback;
  };

  const renderCards = groupItems => groupItems.map(media => (
    <MediaCard key={media.id} media={media} onClick={onItemClick} />
  ));

  return (
    <>
      {groups.map(group => (
        group.title ? (
          <section key={group.key} className="media-section">
            <Button
              variant="text"
              size="sm"
              className="media-section-head"
              aria-expanded={!group.collapsed}
              onClick={() => onToggleSection?.(group.key)}
            >
              <span className="media-section-title">{group.title}</span>
              {group.meta && <span className="media-section-meta">{group.meta}</span>}
              <Icon
                name={group.collapsed ? 'next' : 'down'}
                className="icon-sm media-section-chevron"
              />
            </Button>
            {!group.collapsed && (
              <>
                <div className="item-grid">{renderCards(group.items)}</div>
                {(group.hasMore || group.loadingMore) && (
                  <div ref={getSectionSentinelRef(group.key)} className="grid-sentinel">
                    {group.loadingMore && (
                      <div className="loading-row">
                        <span className="spinner spinner-sm" />
                        Loading…
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </section>
        ) : (
          <div key={group.key} className="item-grid">{renderCards(group.items)}</div>
        )
      ))}
      {onNearEnd && (
        <div ref={sentinelRef} className="grid-sentinel">
          {loadingMore && (
            <div className="loading-row">
              <span className="spinner spinner-sm" />
              Loading…
            </div>
          )}
        </div>
      )}
    </>
  );
}
