/**
 * "Comes to rest" is measured in whole cells, not in velocity: a pixel that
 * has not changed grid cell for `threshold` consecutive frames is blended back
 * into the static image. A pixel in flight above the world never accumulates
 * rest, so a ballistic apex cannot be mistaken for stillness.
 */
import { SKY_CELL } from "./geometry.js";

export const MIN_REST_THRESHOLD = 1;
export const MAX_REST_THRESHOLD = 16;
export const DEFAULT_REST_THRESHOLD = 2;

/**
 * @typedef {{ lastCell: number, restFrames: number }} RestState
 */

/**
 * @param {RestState} state
 * @param {number} cell the cell occupied after this frame's integration
 * @returns {RestState}
 */
export function advanceRest(state, cell) {
  if (cell !== SKY_CELL && cell === state.lastCell) {
    return { lastCell: cell, restFrames: state.restFrames + 1 };
  }
  return { lastCell: cell, restFrames: 0 };
}

/**
 * @param {number} restFrames
 * @param {number} threshold
 * @returns {boolean}
 */
export function shouldDeposit(restFrames, threshold) {
  return restFrames >= Math.max(MIN_REST_THRESHOLD, threshold);
}

/** @param {number} threshold @returns {number} */
export function clampRestThreshold(threshold) {
  return Math.min(MAX_REST_THRESHOLD, Math.max(MIN_REST_THRESHOLD, Math.round(threshold)));
}
