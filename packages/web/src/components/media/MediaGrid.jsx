/**
 * @file Responsive grid of media cards.
 */

import MediaCard from './MediaCard.jsx';

/**
 * Responsive grid layout for displaying media items.
 *
 * @param {Object} props
 * @param {Array} props.items - Array of media objects
 * @param {Function} [props.onItemClick] - Called when a card is clicked
 * @param {React.ReactNode} [props.emptyState] - Content to show when items is empty
 */
export default function MediaGrid({
  items = [],
  onItemClick,
  emptyState,
}) {
  if (items.length === 0 && emptyState) return emptyState;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
      {items.map((media) => (
        <MediaCard
          key={media.id}
          media={media}
          onClick={onItemClick}
        />
      ))}
    </div>
  );
}
