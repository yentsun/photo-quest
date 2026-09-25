/**
 * @file Animated doodle effect definitions shared by the web client and server.
 *
 * A media item may carry one effect config, persisted as JSON in the
 * `media.effect_config` column. Coordinates are normalised to the rendered
 * image (0..1) so an effect survives resizing and letterboxing.
 */

/**
 * Supported effect types.
 * @readonly
 * @type {{ RAYS: 'rays' }}
 */
export const EFFECT_TYPE = {
  /** Doodle rays radiating from a circle the user places on the photo. */
  RAYS: 'rays',
};

/**
 * Bounds applied to a persisted effect config.
 * @readonly
 * @type {{ minRadius: number, maxRadius: number }}
 */
export const EFFECT_LIMITS = {
  minRadius: 0.02,
  maxRadius: 0.75,
};

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

/**
 * Validate and normalise a raw effect config. Returns `null` when the config
 * is absent, and `undefined` when it is present but invalid (so callers can
 * distinguish "clear the effect" from "reject the request").
 *
 * @param {unknown} config
 * @returns {{ type: string, center: { x: number, y: number }, radius: number }|null|undefined}
 */
export function normalizeEffectConfig(config) {
  if (config == null) return null;
  if (typeof config !== 'object' || Array.isArray(config)) return undefined;
  if (!Object.values(EFFECT_TYPE).includes(config.type)) return undefined;

  const x = Number(config.center?.x);
  const y = Number(config.center?.y);
  const radius = Number(config.radius);
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(radius)) return undefined;

  return {
    type: config.type,
    center: { x: clamp(x, 0, 1), y: clamp(y, 0, 1) },
    radius: clamp(radius, EFFECT_LIMITS.minRadius, EFFECT_LIMITS.maxRadius),
  };
}
