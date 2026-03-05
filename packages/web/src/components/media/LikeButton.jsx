/**
 * @file Heart button for liking media items.
 */

import { useState } from 'react';

/**
 * Animated heart button with like count display.
 *
 * @param {Object} props
 * @param {number} props.count - Current like count
 * @param {Function} props.onLike - Called when button is clicked
 * @param {'sm' | 'md' | 'lg'} [props.size='md'] - Size variant
 * @param {string} [props.className] - Additional CSS classes
 */
export default function LikeButton({
  count = 0,
  onLike,
  size = 'md',
  className = '',
}) {
  const [animating, setAnimating] = useState(false);

  const handleClick = (e) => {
    e.stopPropagation();
    setAnimating(true);
    setTimeout(() => setAnimating(false), 300);
    onLike?.();
  };

  const sizes = {
    sm: { button: 'w-8 h-8', icon: 'w-4 h-4', text: 'text-xs' },
    md: { button: 'w-10 h-10', icon: 'w-5 h-5', text: 'text-sm' },
    lg: { button: 'w-12 h-12', icon: 'w-6 h-6', text: 'text-base' },
  };

  const sizeConfig = sizes[size];
  const hasLikes = count > 0;

  return (
    <button
      onClick={handleClick}
      className={`inline-flex flex-col items-center justify-center rounded-full bg-black/50 hover:bg-black/70 transition-all ${sizeConfig.button} ${className}`}
      aria-label={`Like (${count} likes)`}
      title="Like"
    >
      <svg
        className={`${sizeConfig.icon} ${animating ? 'animate-ping' : ''} ${hasLikes ? 'text-red-500 fill-red-500' : 'text-white fill-transparent'} transition-colors`}
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"
        />
      </svg>
      {count > 0 && (
        <span className={`text-white ${sizeConfig.text} font-medium -mt-0.5`}>
          {count > 999 ? '999+' : count}
        </span>
      )}
    </button>
  );
}
