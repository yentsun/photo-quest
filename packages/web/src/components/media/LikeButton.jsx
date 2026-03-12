/**
 * @file Heart button for liking media items.
 */

import { useState } from 'react';
import { Icon } from '../ui/index.js';

/**
 * Animated heart button with like count display.
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
      <Icon
        name="heart"
        className={`${sizeConfig.icon} ${animating ? 'animate-ping' : ''} ${hasLikes ? 'text-red-500 fill-red-500' : 'text-white fill-transparent'} transition-colors`}
        strokeWidth={2}
      />
      {count > 0 && (
        <span className={`text-white ${sizeConfig.text} font-medium -mt-0.5`}>
          {count > 999 ? '999+' : count}
        </span>
      )}
    </button>
  );
}
