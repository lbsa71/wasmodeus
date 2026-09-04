/**
 * World-grid addressing. The world is a `width x height` lattice with `y = 0`
 * at the bottom, so gravity points towards decreasing `y` and "the bottom of
 * the world" (the fountain intake) is the first few rows.
 */

/** Sentinel `last_cell` for a particle that is above the world, i.e. in flight. */
export const SKY_CELL = 0xffffffff;

/** @param {number} x @param {number} y @param {number} width @returns {number} */
export function cellIndex(x, y, width) {
  return y * width + x;
}

/** @param {number} index @param {number} width @returns {number} */
export function cellX(index, width) {
  return index % width;
}

/** @param {number} index @param {number} width @returns {number} */
export function cellY(index, width) {
  return Math.floor(index / width);
}

/** @param {number} x @param {number} y @param {number} width @param {number} height @returns {boolean} */
export function inBounds(x, y, width, height) {
  return x >= 0 && y >= 0 && x < width && y < height;
}

/**
 * Collision test used by the integrator. The side walls and the floor are
 * solid; the sky above the world is open so a fountain jet can overshoot.
 *
 * @param {ArrayLike<number>} field
 * @param {number} x @param {number} y @param {number} width @param {number} height
 * @returns {boolean}
 */
export function isBlocked(field, x, y, width, height) {
  if (x < 0 || x >= width) return true;
  if (y < 0) return true;
  if (y >= height) return false;
  return field[cellIndex(x, y, width)] !== 0;
}

/**
 * Cell a particle occupies, or `SKY_CELL` while it is outside the lattice.
 *
 * @param {number} px @param {number} py @param {number} width @param {number} height
 * @returns {number}
 */
export function cellOfPosition(px, py, width, height) {
  const x = Math.floor(px);
  const y = Math.floor(py);
  if (!inBounds(x, y, width, height)) return SKY_CELL;
  return cellIndex(x, y, width);
}

/** @param {number} index @param {number} width @returns {number} index of the cell directly below */
export function cellBelow(index, width) {
  return index - width;
}
