import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createMediaMagnifier, isVideoControlPress } from '../utils/mediaMagnifier.js';

export default function useMediaMagnifier({ mediaRef, containerRef, src, enabled, onMagnify }) {
  const [zoom, setZoom] = useState(null);
  const options = useRef({ enabled, onMagnify });
  useLayoutEffect(() => { options.current = { enabled, onMagnify }; });

  const gesture = useMemo(() => createMediaMagnifier({
    measure(event) {
      const media = mediaRef.current;
      const container = containerRef.current;
      if (!options.current.enabled || !media || !container) return null;
      // Native video fullscreen cannot transform its fullscreen root. The
      // viewer's fullscreen button keeps the video inside a zoomable container.
      if (document.fullscreenElement === media || media.webkitDisplayingFullscreen) return null;
      const rect = media.getBoundingClientRect();
      if (media.tagName === 'VIDEO' && isVideoControlPress(rect, event.clientY)) return null;
      return { media: rect, viewport: container.getBoundingClientRect() };
    },
    capture(pointerId) {
      const media = mediaRef.current;
      if (!media?.isConnected) return false;
      try { media.setPointerCapture(pointerId); return true; } catch { return false; }
    },
    release(pointerId) {
      const media = mediaRef.current;
      if (media?.hasPointerCapture(pointerId)) media.releasePointerCapture(pointerId);
    },
    onChange: setZoom,
    onConsume: () => options.current.onMagnify?.(),
  }), [mediaRef, containerRef]);

  useLayoutEffect(() => {
    const cancel = () => gesture.interrupt();
    const onKeyDown = (event) => { if (event.key === 'Escape') cancel(); };
    const onPointerDown = (event) => { if (!event.isPrimary) cancel(); };
    const observer = new ResizeObserver(cancel);
    if (containerRef.current) observer.observe(containerRef.current);
    if (mediaRef.current) observer.observe(mediaRef.current);
    window.addEventListener('blur', cancel);
    window.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('visibilitychange', cancel);
    document.addEventListener('fullscreenchange', cancel);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      gesture.interrupt();
      observer.disconnect();
      window.removeEventListener('blur', cancel);
      window.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('visibilitychange', cancel);
      document.removeEventListener('fullscreenchange', cancel);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [gesture, src, enabled, containerRef, mediaRef]);

  return {
    active: !!zoom,
    mediaProps: {
      'data-magnified': zoom ? 'true' : undefined,
      style: zoom ? { transform: `translate(${zoom.x}px, ${zoom.y}px) scale(${zoom.scale})` } : undefined,
      onPointerDown: gesture.start,
      onPointerMove: gesture.move,
      onPointerUp: gesture.end,
      onPointerCancel: gesture.interrupt,
      onLostPointerCapture: gesture.interrupt,
      onPointerLeave: gesture.leave,
      onClickCapture: gesture.click,
      onContextMenu: gesture.contextMenu,
      draggable: false,
      title: 'Hold to magnify · drag to inspect · release to dismiss',
    },
  };
}
