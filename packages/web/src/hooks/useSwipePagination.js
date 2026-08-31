import { useCallback, useEffect, useRef } from 'react';

const MOBILE_QUERY = '(max-width: 639px)';

/**
 * Mobile-only horizontal swipe for grid pagination.
 *
 * Attach `...swipe` to a container (e.g. the `.page` root). Swiping left calls
 * `onNext`, swiping right calls `onPrev`. Vertical-dominant gestures are ignored
 * so the page can still scroll, and the action only fires below the mobile
 * breakpoint.
 */
export default function useSwipePagination({ onPrev, onNext, minDist = 50 }) {
  const startX = useRef(null);
  const startY = useRef(null);
  /* Keep handlers addressable through refs so the touch listeners stay stable
     across renders. */
  const prevRef = useRef(onPrev);
  const nextRef = useRef(onNext);
  useEffect(() => {
    prevRef.current = onPrev;
    nextRef.current = onNext;
  });

  const onTouchStart = useCallback((e) => {
    if (e.touches.length !== 1) return;
    startX.current = e.touches[0].clientX;
    startY.current = e.touches[0].clientY;
  }, []);

  const onTouchEnd = useCallback((e) => {
    /* Only act on the mobile layout. */
    if (!window.matchMedia(MOBILE_QUERY).matches) return;
    if (e.changedTouches.length !== 1 || startX.current == null) return;
    const dx = e.changedTouches[0].clientX - startX.current;
    const dy = e.changedTouches[0].clientY - startY.current;
    startX.current = null;
    startY.current = null;
    if (Math.abs(dx) < minDist) return;
    /* Let vertical scrolling win when the gesture is mostly vertical. */
    if (Math.abs(dx) <= Math.abs(dy)) return;
    if (dx < 0) nextRef.current(); else prevRef.current();
  }, [minDist]);

  return { onTouchStart, onTouchEnd };
}
