/**
 * The fountain is the perturbation source. It does not invent matter: it takes
 * settled pixels out of the bottom rows of the world and relaunches them from
 * a nozzle, which in turn undermines the rows above and keeps the image
 * churning.
 *
 * Its intake rate is servo-driven from the number of free pool slots, so the
 * simulation converges on keeping the whole pool in motion rather than
 * drifting down to a handful of live pixels.
 */
import { random01 } from "./prng.js";

/**
 * @typedef {{
 *   x: number, spread: number, speed: number, jetSpread: number,
 *   baseY: number, baseSpread: number
 * }} NozzleConfig
 */

/**
 * @param {number} freeSlots slots currently available in the pool
 * @param {number} intakeCells how many cells the intake band covers
 * @param {number} refillFrames frames the servo should take to refill the pool
 * @returns {number} per-cell probability in `[0, 1]`
 */
export function intakeChance(freeSlots, intakeCells, refillFrames) {
  if (intakeCells <= 0 || refillFrames <= 0 || freeSlots <= 0) return 0;
  return Math.min(1, freeSlots / (intakeCells * refillFrames));
}

/**
 * Launch state for one intake pixel. Mirrors the `reason == REASON_INTAKE`
 * branch of the WGSL `emit` pass.
 *
 * @param {number} seed
 * @param {NozzleConfig} nozzle
 * @returns {{ pos: [number, number], vel: [number, number] }}
 */
export function nozzleLaunch(seed, nozzle) {
  const across = random01(seed) - 0.5;
  const angle = (random01(seed ^ 0x1234) - 0.5) * nozzle.jetSpread;
  const speed = nozzle.speed * (0.7 + 0.6 * random01(seed ^ 0xabcd));
  return {
    pos: [nozzle.x + across * nozzle.spread, nozzle.baseY + random01(seed ^ 0x9e37) * nozzle.baseSpread],
    vel: [Math.sin(angle) * speed, Math.cos(angle) * speed],
  };
}
