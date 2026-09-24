import { useCallback, useLayoutEffect, useMemo, useState } from 'react';
import { createMediaMagnifier } from '../utils/mediaMagnifier.js';

/**
 * Button-toggled magnifier for a single media element.
 *
 * `mediaRef` must point at the `<img>`/`<video>` and `containerRef` at the area
 * it is fitted into. Returns the active state, a `toggle`, and `mediaProps` to
 * spread onto the media element.
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

  return {
    active: !!zoom,
    toggle,
    mediaProps: {
      'data-magnified': zoom ? 'true' : undefined,
      style: zoom ? { transform: `translate(${zoom.x}px, ${zoom.y}px) scale(${zoom.scale})` } : undefined,
      onPointerDown: gesture.panStart,
      onPointerMove: gesture.panMove,
      onPointerUp: gesture.panEnd,
      onPointerCancel: gesture.panEnd,
      onLostPointerCapture: gesture.panEnd,
      draggable: false,
    },
  };
}
