import { useRef, useState, useEffect, useCallback } from 'react';
import { Grid } from 'react-window';
import MediaCard from './MediaCard.jsx';

const VIRTUALIZE_THRESHOLD = 50;
const GAP = 12;
// Meta bar height: 6px top + 6px bottom padding + ~13px text + 1px border-top ≈ 38px
const META_H = 38;

function getColumnCount(width) {
  if (width >= 1280) return 6;
  if (width >= 1024) return 5;
  if (width >= 768) return 4;
  if (width >= 640) return 3;
  return 2;
}

function Cell({ columnIndex, rowIndex, style, items, columnCount, onItemClick, onItemLike }) {
  const index = rowIndex * columnCount + columnIndex;
  if (index >= items.length) return null;
  return (
    <div style={{ ...style, width: style.width - GAP, height: style.height - GAP }}>
      <MediaCard media={items[index]} onClick={onItemClick} onLike={onItemLike} />
    </div>
  );
}

export default function MediaGrid({ items = [], onItemClick, onItemLike, emptyState, onNearEnd }) {
  const containerRef = useRef(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const nearEndRef = useRef(false);

  const measure = useCallback(() => {
    if (!containerRef.current) return;
    const w = containerRef.current.clientWidth;
    const scrollEl = containerRef.current.closest('main') ?? containerRef.current.parentElement;
    const offsetFromTop = containerRef.current.getBoundingClientRect().top
      - (scrollEl?.getBoundingClientRect().top ?? 0);
    const h = Math.max(200, (scrollEl?.clientHeight ?? window.innerHeight) - Math.max(0, offsetFromTop));
    setDimensions(prev => (prev.width === w && prev.height === h ? prev : { width: w, height: h }));
  }, []);

  useEffect(() => {
    measure();
    const observer = new ResizeObserver(measure);
    if (containerRef.current) observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [measure]);

  const { width, height } = dimensions;
  const columnCount = getColumnCount(width);
  const rowCount = Math.ceil(items.length / columnCount);
  const columnWidth = width > 0 ? width / columnCount : 200;
  // Card is 4:3 frame + meta row; cell = (colW - GAP) so frame = (colW - GAP) * 0.75
  const rowHeight = Math.round((columnWidth - GAP) * 0.75 + META_H + GAP);

  const handleScroll = useCallback((e) => {
    if (!onNearEnd) return;
    const { scrollTop, clientHeight, scrollHeight } = e.currentTarget;
    if (scrollHeight - scrollTop - clientHeight < rowHeight * 3) {
      if (!nearEndRef.current) { nearEndRef.current = true; onNearEnd(); }
    } else {
      nearEndRef.current = false;
    }
  }, [onNearEnd, rowHeight]);

  if (items.length === 0 && emptyState) return emptyState;

  if (items.length <= VIRTUALIZE_THRESHOLD) {
    return (
      <div className="item-grid">
        {items.map(media => (
          <MediaCard key={media.id} media={media} onClick={onItemClick} onLike={onItemLike} />
        ))}
      </div>
    );
  }

  return (
    <div ref={containerRef} style={{ width: '100%' }}>
      {width > 0 && (
        <Grid
          cellComponent={Cell}
          cellProps={{ items, columnCount, onItemClick, onItemLike }}
          columnCount={columnCount}
          columnWidth={columnWidth}
          rowCount={rowCount}
          rowHeight={rowHeight}
          overscanCount={2}
          style={{ height, width, overflowX: 'hidden' }}
          onScroll={handleScroll}
        />
      )}
    </div>
  );
}
