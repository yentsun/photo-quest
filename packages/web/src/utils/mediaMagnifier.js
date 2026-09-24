export const MAGNIFIER_SCALE = 3;

/* Translation is relative to the fitted media's top-left (transform-origin: 0 0).
 * A dimension smaller than the viewport stays centered, including letterboxing. */
export function clampMagnifier(media, viewport, x, y, scale = MAGNIFIER_SCALE) {
  const clampAxis = (offset, size, viewportSize, translation) => {
    const scaled = size * scale;
    if (scaled <= viewportSize) return (viewportSize - scaled) / 2 - offset;
    return Math.max(viewportSize - offset - scaled, Math.min(-offset, translation));
  };
  return {
    x: clampAxis(media.left - viewport.left, media.width, viewport.width, x),
    y: clampAxis(media.top - viewport.top, media.height, viewport.height, y),
    scale,
  };
}

/* Native video controls are browser-owned. While the magnifier is off, a swipe
 * that starts on their strip must not navigate. */
export function isVideoControlPress(rect, clientY) {
  return clientY >= rect.bottom - Math.min(64, rect.height / 3);
}

/*
 * Button-toggled magnifier. Unlike a hold gesture it never intercepts native
 * long-press / image-menu behaviour: it stays dormant until the user presses
 * the magnifier button, and only then captures pointer drags to pan.
 *
 * Framework-independent so the bounds, toggle and pan logic can be tested
 * without a browser; the hook supplies DOM measurement and wires the element.
 */
export function createMediaMagnifier({ measure, onChange }) {
  let zoom = null;
  /* Bounds captured when the magnifier opened; a resize interrupts instead of
   * going stale, so they stay valid for the whole session. */
  let bounds = null;
  let pan = null;

  const clear = () => {
    pan = null;
    bounds = null;
    if (zoom) {
      zoom = null;
      onChange(null);
    }
  };

  return {
    /* Toggle the magnifier, anchored at the media centre. Returns true when it
       ends up active. */
    toggle() {
      if (zoom) { clear(); return false; }
      const next = measure();
      if (!next || !next.media.width || !next.media.height) return false;
      bounds = next;
      zoom = clampMagnifier(next.media, next.viewport,
        (1 - MAGNIFIER_SCALE) * (next.media.width / 2),
        (1 - MAGNIFIER_SCALE) * (next.media.height / 2));
      onChange(zoom);
      return true;
    },

    deactivate: clear,

    /* While active, a primary-button drag on the media pans the enlarged view. */
    panStart(event) {
      if (!zoom || event.button !== 0) return;
      pan = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
      try { event.currentTarget?.setPointerCapture(event.pointerId); } catch { /* capture is best-effort */ }
    },

    panMove(event) {
      if (!zoom || !pan || event.pointerId !== pan.pointerId) return;
      const dx = event.clientX - pan.x;
      const dy = event.clientY - pan.y;
      if (!dx && !dy) return;
      event.preventDefault();
      pan.x = event.clientX;
      pan.y = event.clientY;
      zoom = clampMagnifier(bounds.media, bounds.viewport, zoom.x + dx, zoom.y + dy);
      onChange(zoom);
    },

    panEnd(event) {
      if (!pan || event.pointerId !== pan.pointerId) return;
      try { event.currentTarget?.releasePointerCapture(event.pointerId); } catch { /* already released */ }
      pan = null;
    },

    interrupt: clear,
  };
}
