/**
 * Tuning for the simulation, in world units (one unit is one pixel of the
 * image) and seconds.
 */
import { DEFAULT_CAPACITY } from "./capacity.js";
import { DEFAULT_REST_THRESHOLD } from "./rest.js";
import { DEFAULT_WORLD_HEIGHT, DEFAULT_WORLD_WIDTH } from "./source-image.js";

/**
 * @typedef {{
 *   world: { width: number, height: number },
 *   capacity: number,
 *   restThreshold: number,
 *   substeps: number,
 *   frameSeconds: number,
 *   gravity: number,
 *   damping: number,
 *   restitution: number,
 *   dislodgeSpeed: number,
 *   intakeRows: number,
 *   refillFrames: number,
 *   fountain: { x: number, spread: number, speed: number },
 *   blastRadius: number,
 *   blastStrength: number
 * }} Settings
 */

/** @returns {Settings} */
export function defaultSettings() {
  const world = { width: DEFAULT_WORLD_WIDTH, height: DEFAULT_WORLD_HEIGHT };
  return {
    world,
    capacity: DEFAULT_CAPACITY,
    restThreshold: DEFAULT_REST_THRESHOLD,
    // Four substeps keep a fast jet under ~2.5 cells per step, which is what
    // stops it tunnelling straight through a one-pixel-thick wall.
    substeps: 4,
    frameSeconds: 1 / 60,
    gravity: 500,
    damping: 0.999,
    restitution: 0.25,
    dislodgeSpeed: 90,
    // The fountain draws from this many rows at the very bottom of the world.
    intakeRows: 24,
    // Frames the intake servo should take to refill an empty pool.
    refillFrames: 30,
    fountain: { x: world.width * 0.5, spread: world.width * 0.012, speed: 680 },
    blastRadius: 28,
    blastStrength: 320,
  };
}

/**
 * Number of cells the fountain can draw from, used by the intake servo.
 *
 * @param {Settings} settings
 * @returns {number}
 */
export function intakeCellCount(settings) {
  return settings.world.width * settings.intakeRows;
}
