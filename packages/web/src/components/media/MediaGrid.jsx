/**
 * @file Responsive virtualized grid of media cards.
 *
 * Uses react-window Grid so only visible cards are rendered to the DOM,
 * keeping memory usage constant regardless of library size.
 */

import { useRef, useState, useEffect, useCallback } from 'react';
import { Grid } from 'react-window';
import MediaCard from './MediaCard.jsx';

/** Threshold below which we skip virtualisation (not worth the overhead). */
const VIRTUALIZE_THRESHOLD = 50;

/** Gap between grid items in pixels (matches gap-3 = 0.75rem ≈ 12px). */
const GAP = 12;

/** Breakpoints matching Tailwind's default: cols at sm/md/lg/xl. */
function getColumnCount(width) {
  if (width >= 1280) return 6; // xl
  if (width >= 1024) return 5; // lg
  if (width >= 768) return 4;  // md
  if (width >= 640) return 3;  // sm
  return 2;
}

/**
 * Cell component for the virtualised Grid (react-window v2 API).
 * Receives columnIndex, rowIndex, style from Grid plus custom cellProps.
 */
function Cell({ columnIndex, rowIndex, style, items, columnCount, onItemClick, onItemLike }) {
  const index = rowIndex * columnCount + columnIndex;
  if (index >= items.length) return null;
  const media = items[index];

  const adjustedStyle = {
    ...style,
    width: style.width - GAP,
    height: style.height - GAP,
  };

  return (
    <div style={adjustedStyle}>
      <MediaCard
        media={media}
        onClick={onItemClick}
        onLike={onItemLike}
      />
    </div>
  );
}

/**
 * Responsive grid layout for displaying media items.
 * Virtualises when the item count exceeds VIRTUALIZE_THRESHOLD.
 *
 * @param {Object} props
 * @param {Array} props.items - Array of media objects
 * @param {Function} [props.onItemClick] - Called when a card is clicked
 * @param {Function} [props.onItemLike] - Called when like button is clicked
 * @param {React.ReactNode} [props.emptyState] - Content to show when items is empty
 * @param {Function} [props.onNearEnd] - Called when the user scrolls within ~3 rows of the last item
 */
export default function MediaGrid({
  items = [],
  onItemClick,
  onItemLike,
  emptyState,
  onNearEnd,
}) {
  const containerRef = useRef(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  /* nearEndRef prevents firing onNearEnd on every scroll tick when already near the end. */
  const nearEndRef = useRef(false);

  const measure = useCallback(() => {
    if (!containerRef.current) return;
    const w = containerRef.current.clientWidth;
    const scrollEl = containerRef.current.closest('main') ?? containerRef.current.parentElement;
    const availableHeight = scrollEl
      ? scrollEl.clientHeight - Math.max(0, containerRef.current.getBoundingClientRect().top - scrollEl.getBoundingClientRect().top)
      : window.innerHeight - containerRef.current.getBoundingClientRect().top;
    const h = Math.max(200, availableHeight);
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
  const rowHeight = columnWidth; // aspect-square cards

  /* Fire onNearEnd when user scrolls within 3 rows of the last item. */
  const handleScroll = useCallback((e) => {
    if (!onNearEnd) return;
    const { scrollTop, clientHeight, scrollHeight } = e.currentTarget;
    const distanceFromEnd = scrollHeight - scrollTop - clientHeight;
    if (distanceFromEnd < rowHeight * 3) {
      if (!nearEndRef.current) {
        nearEndRef.current = true;
        onNearEnd();
      }
    } else {
      nearEndRef.current = false;
    }
  }, [onNearEnd, rowHeight]);

  if (items.length === 0 && emptyState) {
    return emptyState;
  }

  // For small lists, render without virtualisation
  if (items.length <= VIRTUALIZE_THRESHOLD) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
        {items.map((media) => (
          <MediaCard
            key={media.id}
            media={media}
            onClick={onItemClick}
            onLike={onItemLike}
          />
        ))}
      </div>
    );
  }

  return (
    <div ref={containerRef} className="w-full">
      {width > 0 && (
        <Grid
          cellComponent={Cell}
          cellProps={{ items, columnCount, onItemClick, onItemLike }}
          columnCount={columnCount}
          columnWidth={columnWidth}
          rowCount={rowCount}
          rowHeight={rowHeight}
          overscanCount={2}
          width={width}
          height={height}
          style={{ overflowX: 'hidden' }}
          onScroll={handleScroll}
        />
      )}
    </div>
  );
}
