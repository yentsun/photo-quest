import { useRef, useEffect } from 'react';
import MediaCard from './MediaCard.jsx';
import { Button, Icon } from '../ui/index.js';

/**
 * Render media as a flat grid, or as titled sections (e.g. Timeline days).
 *
 * `sections` takes precedence over `items`; each section is
 * `{ key, title?, meta?, items, collapsed? }`. `onToggleSection(key)` makes a
 * titled section collapsible. An optional `onNearEnd` callback drives
 * auto-loading through a bottom sentinel; `loadingMore` renders the indicator
 * in that sentinel.
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
            {!group.collapsed && <div className="item-grid">{renderCards(group.items)}</div>}
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
