export const MAGNIFIER_DELAY = 450;
export const MAGNIFIER_SCALE = 3;
const MOVE_TOLERANCE = 10;

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

/* Native video controls are browser-owned, so reserve their bottom strip rather
 * than attempting to inspect their closed shadow DOM. Short presses elsewhere
 * retain the browser's normal playback behaviour. */
export function isVideoControlPress(rect, clientY) {
  return clientY >= rect.bottom - Math.min(64, rect.height / 3);
}

/* Framework-independent gesture state so timing, cancellation, and bounds can
 * be tested without a browser. The hook supplies DOM measurement/capture. */
export function createMediaMagnifier({ measure, capture, release, onChange, onConsume }) {
  let gesture = null;
  let timer = null;
  let suppressClick = false;

  const cancel = () => {
    clearTimeout(timer);
    timer = null;
    const previous = gesture;
    gesture = null;
    if (previous?.zoom) {
      onChange(null);
      release(previous.pointerId);
    }
  };

  return {
    start(event) {
      if (gesture || event.isPrimary === false) {
        if (gesture) onConsume();
        cancel();
        return;
      }
      if (event.button !== 0) return;
      suppressClick = false;
      const bounds = measure(event);
      if (!bounds || !bounds.media.width || !bounds.media.height) return;
      gesture = { pointerId: event.pointerId, pointerType: event.pointerType, x: event.clientX, y: event.clientY, ...bounds };
      timer = setTimeout(() => {
        timer = null;
        const g = gesture;
        if (!g) return;
        if (!capture(g.pointerId)) { cancel(); return; }
        g.zoom = clampMagnifier(g.media, g.viewport,
          (1 - MAGNIFIER_SCALE) * (g.x - g.media.left),
          (1 - MAGNIFIER_SCALE) * (g.y - g.media.top));
        suppressClick = true;
        onConsume();
        onChange(g.zoom);
      }, MAGNIFIER_DELAY);
    },
    move(event) {
      const g = gesture;
      if (!g || event.pointerId !== g.pointerId) return;
      const dx = event.clientX - g.x;
      const dy = event.clientY - g.y;
      if (!g.zoom) {
        if (Math.hypot(dx, dy) >= MOVE_TOLERANCE) cancel();
        return;
      }
      event.preventDefault();
      g.zoom = clampMagnifier(g.media, g.viewport, g.zoom.x + dx, g.zoom.y + dy);
      g.x = event.clientX;
      g.y = event.clientY;
      onChange(g.zoom);
    },
    end(event) {
      if (gesture?.pointerId !== event.pointerId) return;
      if (gesture.zoom) event.preventDefault();
      cancel();
    },
    leave() {
      if (!gesture?.zoom) cancel();
    },
    click(event) {
      if (!suppressClick || event.detail === 0) return;
      event.preventDefault();
      event.stopPropagation();
    },
    contextMenu(event) {
      const pointerType = event.pointerType ?? event.nativeEvent?.pointerType;
      if (gesture?.pointerType === 'touch' || gesture?.pointerType === 'pen' ||
          (suppressClick && (pointerType === 'touch' || pointerType === 'pen'))) event.preventDefault();
    },
    interrupt() {
      if (gesture) onConsume();
      cancel();
    },
    cancel,
  };
}
