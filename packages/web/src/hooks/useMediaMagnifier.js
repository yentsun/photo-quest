import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createMediaMagnifier } from '../utils/mediaMagnifier.js';

/* Pointer travel (px) above which a mouse press is a drag, not a zoom click. */
const CLICK_SLOP = 6;

/**
 * Magnifier for a single media element, toggled from the viewer.
 *
 * `mediaRef` must point at the `<img>`/`<video>` and `containerRef` at the area
 * it is fitted into. Returns the active state, a `toggle`, `mediaProps` to
 * spread onto the media element, and `onMediaClick` for elements that should
 * zoom on a mouse click.
 */
export default function useMediaMagnifier({ mediaRef, containerRef, src }) {
  const [zoom, setZoom] = useState(null);

  const gesture = useMemo(() => createMediaMagnifier({
    measure() {
      const media = mediaRef.current;
      const container = containerRef.current;
      if (!media || !container) return null;
      /* Native video fullscreen cannot transform its fullscreen root. */
      if (document.fullscreenElement === media || media.webkitDisplayingFullscreen) return null;
      const rect = media.getBoundingClientRect();
      if (!rect.width || !rect.height) return null;
      return { media: rect, viewport: container.getBoundingClientRect() };
    },
    onChange: setZoom,
  }), [mediaRef, containerRef]);

  /* Any layout, focus, visibility or source change ends the session rather than
     leaving a stale transform behind. */
  useLayoutEffect(() => {
    const interrupt = () => gesture.interrupt();
    const onKeyDown = (event) => { if (event.key === 'Escape') interrupt(); };
    const observer = new ResizeObserver(interrupt);
    if (containerRef.current) observer.observe(containerRef.current);
    if (mediaRef.current) observer.observe(mediaRef.current);
    window.addEventListener('blur', interrupt);
    document.addEventListener('visibilitychange', interrupt);
    document.addEventListener('fullscreenchange', interrupt);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      gesture.interrupt();
      observer.disconnect();
      window.removeEventListener('blur', interrupt);
      document.removeEventListener('visibilitychange', interrupt);
      document.removeEventListener('fullscreenchange', interrupt);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [gesture, src, containerRef, mediaRef]);

  const toggle = useCallback(() => gesture.toggle(), [gesture]);

  /* A click is only a zoom request when it starts and ends on the same point of
     a mouse press: the slop rejects a drag released over the photo, and only
     mouse presses are recorded, so the synthetic click a touch tap produces
     leaves the tap behaviour (showing the controls) untouched. */
  const pressRef = useRef(null);
  const panStart = useCallback((event) => {
    pressRef.current = event.pointerType === 'mouse' && event.button === 0
      ? { x: event.clientX, y: event.clientY }
      : null;
    gesture.panStart(event);
  }, [gesture]);

  const handleClick = useCallback((event) => {
    const press = pressRef.current;
    pressRef.current = null;
    if (!press) return;
    if (Math.hypot(event.clientX - press.x, event.clientY - press.y) > CLICK_SLOP) return;
    toggle();
  }, [toggle]);

  return {
    active: !!zoom,
    toggle,
    onMediaClick: handleClick,
    mediaProps: {
      'data-magnified': zoom ? 'true' : undefined,
      style: zoom ? { transform: `translate(${zoom.x}px, ${zoom.y}px) scale(${zoom.scale})` } : undefined,
      onPointerDown: panStart,
      onPointerMove: gesture.panMove,
      onPointerUp: gesture.panEnd,
      onPointerCancel: gesture.panEnd,
      onLostPointerCapture: gesture.panEnd,
      draggable: false,
    },
  };
}
