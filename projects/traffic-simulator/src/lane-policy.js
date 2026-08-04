const ROAD_MASK = 15;
const NORTH = 1;
const EAST = 2;
const SOUTH = 4;
const WEST = 8;
const HORIZONTAL = EAST | WEST;
const VERTICAL = NORTH | SOUTH;

/**
 * Find long, uninterrupted straight-road interiors that can safely widen.
 * The returned byte array contains one for four-lane tiles and zero elsewhere.
 *
 * @param {Uint8Array} tiles
 * @param {number} width
 * @param {number} height
 * @param {{ minimumRun?: number, transitionBuffer?: number }} [options]
 * @returns {Uint8Array}
 */
export function markStraightArterials(
  tiles,
  width,
  height,
  { minimumRun = 20, transitionBuffer = 4 } = {},
) {
  const arterials = new Uint8Array(tiles.length);

  /** @param {number[]} run */
  function markRun(run) {
    if (run.length < minimumRun) return;
    for (
      let index = transitionBuffer;
      index < run.length - transitionBuffer;
      index += 1
    ) {
      arterials[run[index]] = 1;
    }
  }

  for (let y = 0; y < height; y += 1) {
    /** @type {number[]} */
    let run = [];
    for (let x = 0; x <= width; x += 1) {
      const tile = y * width + x;
      if (x < width && (tiles[tile] & ROAD_MASK) === HORIZONTAL) {
        run.push(tile);
      } else {
        markRun(run);
        run = [];
      }
    }
  }

  for (let x = 0; x < width; x += 1) {
    /** @type {number[]} */
    let run = [];
    for (let y = 0; y <= height; y += 1) {
      const tile = y * width + x;
      if (y < height && (tiles[tile] & ROAD_MASK) === VERTICAL) {
        run.push(tile);
      } else {
        markRun(run);
        run = [];
      }
    }
  }

  return arterials;
}

/**
 * Decide between the right-hand slow lane (0) and passing lane (1).
 *
 * @param {{
 *   currentLane: number,
 *   distanceToLaneEnd: number,
 *   onFourLane: boolean,
 *   passingFollowerDistance: number,
 *   passingLeaderDistance: number,
 *   slowFollowerDistance?: number,
 *   slowLeaderDistance: number,
 * }} state
 * @returns {0 | 1}
 */
export function chooseTravelLane({
  currentLane,
  distanceToLaneEnd,
  onFourLane,
  passingFollowerDistance,
  passingLeaderDistance,
  slowFollowerDistance = Number.POSITIVE_INFINITY,
  slowLeaderDistance,
}) {
  if (!onFourLane) return 0;

  const passingIsSafe =
    passingLeaderDistance >= 1 &&
    passingFollowerDistance >= 0.5 &&
    distanceToLaneEnd >= 3;
  if (currentLane === 0) {
    return slowLeaderDistance < 0.5 && passingIsSafe ? 1 : 0;
  }

  const slowLaneIsSafe =
    slowLeaderDistance >= 1 && slowFollowerDistance >= 0.5;
  const urgentMergeIsSafe =
    distanceToLaneEnd < 3 &&
    slowLeaderDistance >= 0.5 &&
    slowFollowerDistance >= 0.5;
  if (slowLaneIsSafe || urgentMergeIsSafe) {
    return 0;
  }
  return 1;
}
