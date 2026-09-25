import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { EFFECT_TYPE, EFFECT_LIMITS } from '@photo-quest/shared';

const RAY_COUNT = 12;

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

/** Parse a raw config (server/IDB may hand us a JSON string). */
function readConfig(config) {
  if (!config) return null;
  if (typeof config === 'string') {
    try { return JSON.parse(config); } catch { return null; }
  }
  return config;
}

/**
 * Animated doodle overlay drawn on top of a photo.
 *
 * When `editing` is true it renders a draggable/resizable accent circle and
 * reports live changes through `onChange`. Otherwise it plays the configured
 * effect (doodle rays) from the saved circle.
 *
 * The overlay is positioned from the rendered media's rect and mirrors the
 * magnifier transform so it stays aligned while the photo is zoomed/panned.
 */
export default function DoodleOverlay({
  mediaRef,
  containerRef,
  config,
  editing = false,
  transform,
  onChange,
}) {
  const parsed = readConfig(config);
  const [rect, setRect] = useState(null);
  const dragRef = useRef(null);

  const measure = useCallback(() => {
    const media = mediaRef.current;
    const container = containerRef.current;
    if (!media || !container) return;
    /* A magnified media reports a transformed rect; keep the last good one. */
    if (media.dataset?.magnified === 'true') return;
    const mediaRect = media.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    if (!mediaRect.width || !mediaRect.height) return;
    setRect({
      left: mediaRect.left - containerRect.left,
      top: mediaRect.top - containerRect.top,
      width: mediaRect.width,
      height: mediaRect.height,
    });
  }, [mediaRef, containerRef]);

  useLayoutEffect(() => {
    measure();
    const media = mediaRef.current;
    media?.addEventListener('load', measure);
    const observer = new ResizeObserver(measure);
    if (mediaRef.current) observer.observe(mediaRef.current);
    if (containerRef.current) observer.observe(containerRef.current);
    window.addEventListener('resize', measure);
    return () => {
      media?.removeEventListener('load', measure);
      observer.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [measure, mediaRef, containerRef]);

  const handlePointerDown = useCallback((mode) => (event) => {
    if (!editing || !rect || !parsed) return;
    event.preventDefault();
    event.stopPropagation();
    dragRef.current = {
      mode,
      startX: event.clientX,
      startY: event.clientY,
      startCenter: { ...parsed.center },
      rect,
      base: parsed,
    };

    const handleMove = (moveEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      const { rect: r, base } = drag;
      if (drag.mode === 'move') {
        const nx = drag.startCenter.x + (moveEvent.clientX - drag.startX) / r.width;
        const ny = drag.startCenter.y + (moveEvent.clientY - drag.startY) / r.height;
        onChange({ ...base, center: { x: clamp(nx, 0, 1), y: clamp(ny, 0, 1) } });
      } else {
        const cx = r.left + base.center.x * r.width;
        const cy = r.top + base.center.y * r.height;
        const distance = Math.hypot(moveEvent.clientX - cx, moveEvent.clientY - cy);
        const radius = distance / Math.min(r.width, r.height);
        onChange({ ...base, radius: clamp(radius, EFFECT_LIMITS.minRadius, EFFECT_LIMITS.maxRadius) });
      }
    };

    const handleUp = () => {
      dragRef.current = null;
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
      window.removeEventListener('pointercancel', handleUp);
    };

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
    window.addEventListener('pointercancel', handleUp);
  }, [editing, rect, parsed, onChange]);

  if (!rect || (!parsed && !editing)) return null;

  const width = rect.width;
  const height = rect.height;
  const minSide = Math.min(width, height);
  const shown = parsed || { type: EFFECT_TYPE.RAYS, center: { x: 0.5, y: 0.5 }, radius: 0.15 };
  const cx = shown.center.x * width;
  const cy = shown.center.y * height;
  const radius = shown.radius * minSide;

  const rays = Array.from({ length: RAY_COUNT }, (_, i) => {
    const angle = (i / RAY_COUNT) * Math.PI * 2;
    const outer = radius * (1.55 + (i % 3) * 0.18);
    return {
      key: i,
      x1: cx + Math.cos(angle) * radius,
      y1: cy + Math.sin(angle) * radius,
      x2: cx + Math.cos(angle) * outer,
      y2: cy + Math.sin(angle) * outer,
    };
  });

  return (
    <div
      className={`doodle-overlay${editing ? ' doodle-overlay-editing' : ''}`}
      data-testid="doodle-overlay"
      style={{
        left: rect.left,
        top: rect.top,
        width,
        height,
        ...(transform || {}),
      }}
    >
      <svg className="doodle-overlay-svg" viewBox={`0 0 ${width} ${height}`} width={width} height={height}>
        {!editing && shown.type === EFFECT_TYPE.RAYS && (
          <g className="doodle-rays">
            {rays.map(ray => (
              <line
                key={ray.key}
                className="doodle-ray"
                x1={ray.x1}
                y1={ray.y1}
                x2={ray.x2}
                y2={ray.y2}
                pathLength="1"
              />
            ))}
          </g>
        )}

        {editing && (
          <g className="doodle-accent-editor">
            <circle className="doodle-accent-move" cx={cx} cy={cy} r={radius} onPointerDown={handlePointerDown('move')} />
            <circle className="doodle-accent-outline" cx={cx} cy={cy} r={radius} />
            <line
              className="doodle-accent-handle-line"
              x1={cx}
              y1={cy}
              x2={cx + radius}
              y2={cy}
            />
            <circle
              className="doodle-accent-handle"
              cx={cx + radius}
              cy={cy}
              r={Math.max(10, radius * 0.12)}
              onPointerDown={handlePointerDown('resize')}
            />
            <circle className="doodle-accent-center" cx={cx} cy={cy} r={3} />
          </g>
        )}
      </svg>
    </div>
  );
}
