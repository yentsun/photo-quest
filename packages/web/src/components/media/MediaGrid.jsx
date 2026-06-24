import { useRef, useEffect } from 'react';
import MediaCard from './MediaCard.jsx';

export default function MediaGrid({ items = [], onItemClick, onItemLike, emptyState, onNearEnd }) {
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

  if (items.length === 0 && emptyState) return emptyState;

  return (
    <>
      <div className="item-grid">
        {items.map(media => (
          <MediaCard key={media.id} media={media} onClick={onItemClick} onLike={onItemLike} />
        ))}
      </div>
      {onNearEnd && <div ref={sentinelRef} />}
    </>
  );
}
