import { useRef, useEffect } from 'react';
import MediaCard from './MediaCard.jsx';

/**
 * Render media as a flat grid, or as titled sections (e.g. Timeline days).
 *
 * `sections` takes precedence over `items`; each section is
 * `{ key, title?, meta?, items }`. An optional `onNearEnd` callback drives
 * auto-loading through a bottom sentinel; `loadingMore` renders the indicator
 * in that sentinel.
 */
export default function MediaGrid({
  items = [],
  sections,
  onItemClick,
  emptyState,
  onNearEnd,
  loadingMore = false,
}) {
  const sentinelRef = useRef(null);

  useEffect(() => {
    if (!onNearEnd || !sentinelRef.current) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) onNearEnd(); },
      { rootMargin: '400px' }
    );
    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [onNearEnd]);

  const groups = sections ?? [{ key: 'all', items }];
  const itemCount = groups.reduce((sum, group) => sum + group.items.length, 0);

  if (itemCount === 0 && emptyState) return emptyState;

  const renderCards = groupItems => groupItems.map(media => (
    <MediaCard key={media.id} media={media} onClick={onItemClick} />
  ));

  return (
    <>
      {groups.map(group => (
        group.title ? (
          <section key={group.key} className="media-section">
            <div className="media-section-head">
              <h2 className="media-section-title">{group.title}</h2>
              {group.meta && <span className="media-section-meta">{group.meta}</span>}
            </div>
            <div className="item-grid">{renderCards(group.items)}</div>
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
