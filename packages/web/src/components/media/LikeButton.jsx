import { useState } from 'react';
import { Icon } from '../ui/index.js';

export default function LikeButton({ count = 0, onLike, size = 'md', className = '' }) {
  const [animating, setAnimating] = useState(false);

  const handleClick = (e) => {
    e.stopPropagation();
    setAnimating(true);
    setTimeout(() => setAnimating(false), 300);
    onLike?.();
  };

  const sizeClass = size === 'sm' ? 'like-btn-sm' : size === 'lg' ? 'like-btn-lg' : 'like-btn-md';
  const iconClass = size === 'sm' ? 'icon-sm' : size === 'lg' ? 'icon-lg' : 'icon-md';
  const hasLikes = count > 0;

  return (
    <button
      onClick={handleClick}
      className={['like-btn', sizeClass, className].filter(Boolean).join(' ')}
      aria-label={`Like (${count} likes)`}
      title="Like"
    >
      <Icon
        name="heart"
        className={[iconClass, animating ? 'like-animating' : '', hasLikes ? 'text-red fill-red' : 'fill-transparent'].filter(Boolean).join(' ')}
        strokeWidth={2}
      />
      {count > 0 && (
        <span className="like-count">{count > 999 ? '999+' : count}</span>
      )}
    </button>
  );
}
