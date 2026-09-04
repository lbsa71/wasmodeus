/**
 * The slider that controls how many pixels may be in motion is exponential:
 * the UI value is an exponent, the pool size is `2 ** exponent`. That keeps
 * the interesting range (a few thousand to a few million) reachable in one
 * sweep while still resolving the knee where the simulation goes sluggish.
 */
export const MIN_EXPONENT = 10;
export const MAX_EXPONENT = 27;
/** Eighth-of-an-octave steps: ~9% capacity change per notch. */
export const EXPONENT_STEP = 0.125;
/**
 * Ten million by default. The device's own limits cap the top of the slider —
 * see `maxCapacityFor` — and the world's total matter caps how many of those
 * slots can ever actually be filled.
 */
export const DEFAULT_CAPACITY = 10_000_000;

/**
 * @param {number} exponent
 * @returns {number} pool size, always at least 1
 */
export function capacityFromExponent(exponent) {
  const clamped = Math.min(MAX_EXPONENT, Math.max(MIN_EXPONENT, exponent));
  // The device's own ceiling is applied separately, by the engine.
  return Math.max(1, Math.round(2 ** clamped));
}

/**
 * @param {number} capacity
 * @returns {number} the slider position that reproduces `capacity`
 */
export function exponentFromCapacity(capacity) {
  return Math.max(MIN_EXPONENT, Math.log2(Math.max(1, capacity)));
}

/** @param {number} value @returns {number} smallest power of two `>= value` */
export function nextPowerOfTwo(value) {
  if (value <= 1) return 1;
  return 2 ** Math.ceil(Math.log2(value));
}

/**
 * The free-slot ring is indexed with a bitmask, so it is padded to a power of
 * two even when the pool itself is not.
 *
 * @param {number} capacity
 * @returns {number}
 */
export function ringSize(capacity) {
  return nextPowerOfTwo(Math.max(1, capacity));
}

/** @param {number} capacity @returns {number} */
export function ringMask(capacity) {
  return ringSize(capacity) - 1;
}

/**
 * @param {number} value
 * @returns {string} a compact human-readable count, e.g. `1.05 M`
 */
export function formatCount(value) {
  if (!Number.isFinite(value)) return "—";
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(2)} M`;
  if (abs >= 1_000) return `${(value / 1_000).toFixed(1)} k`;
  return `${Math.round(value)}`;
}
