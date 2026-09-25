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
 * @type {{ RAYS: 'rays', ARROWS: 'arrows' }}
 */
export const EFFECT_TYPE = {
  /** Doodle rays radiating out from a circle the user places on the photo. */
  RAYS: 'rays',
  /** Doodle arrows flying in toward a circle the user places on the photo. */
  ARROWS: 'arrows',
};

/** Labels for the effect-type picker. */
export const EFFECT_TYPE_OPTIONS = [
  { value: EFFECT_TYPE.RAYS, label: 'Rays' },
  { value: EFFECT_TYPE.ARROWS, label: 'Arrows' },
];

/** Default element count and the selectable range for each effect type. */
export const EFFECT_COUNT = {
  [EFFECT_TYPE.RAYS]: { default: 12, min: 4, max: 24 },
  [EFFECT_TYPE.ARROWS]: { default: 8, min: 3, max: 16 },
};

/** The count settings for a type, falling back to the rays defaults. */
export function effectCount(type) {
  return EFFECT_COUNT[type] ?? EFFECT_COUNT[EFFECT_TYPE.RAYS];
}

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
 * @returns {{ type: string, center: { x: number, y: number }, radius: number, count: number }|null|undefined}
 */
export function normalizeEffectConfig(config) {
  if (config == null) return null;
  if (typeof config !== 'object' || Array.isArray(config)) return undefined;
  if (!Object.values(EFFECT_TYPE).includes(config.type)) return undefined;

  const x = Number(config.center?.x);
  const y = Number(config.center?.y);
  const radius = Number(config.radius);
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(radius)) return undefined;

  const { default: defaultCount, min, max } = effectCount(config.type);
  const requested = Number(config.count);
  const count = Number.isFinite(requested) ? clamp(Math.round(requested), min, max) : defaultCount;

  return {
    type: config.type,
    center: { x: clamp(x, 0, 1), y: clamp(y, 0, 1) },
    radius: clamp(radius, EFFECT_LIMITS.minRadius, EFFECT_LIMITS.maxRadius),
    count,
  };
}
