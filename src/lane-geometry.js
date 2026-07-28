export const NORTH = 1;
export const EAST = 2;
export const SOUTH = 4;
export const WEST = 8;

/**
 * Offset a centerline position into the right-hand lane for its direction.
 * @param {number} x
 * @param {number} y
 * @param {number} direction
 * @param {number} offset
 */
export function lanePosition(x, y, direction, offset) {
  if (direction === EAST) return { x, y: y + offset };
  if (direction === WEST) return { x, y: y - offset };
  if (direction === SOUTH) return { x: x - offset, y };
  if (direction === NORTH) return { x: x + offset, y };
  return { x, y };
}
