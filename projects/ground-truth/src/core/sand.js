/**
 * Cohesion, and the sand rule.
 *
 * Every cell carries a **bond**: how many of its eight neighbours it needs in
 * order to stay put. That single number spans the whole range of behaviour:
 *
 * - bond 0 — needs nothing. Bedrock. Only an explosion moves it.
 * - bond 2 — stone. A cave ceiling rests on its neighbours to either side, so
 *   caverns and overhangs hold, but a one-pixel spar left hanging in space
 *   loses its grip and drops.
 * - bond 4 — packed dirt. Holds a gentle slope; collapses when dug into.
 * - bond 5-6 — sand and gravel. Needs to be nearly buried, so it runs off any
 *   edge and finds its angle of repose.
 *
 * Cohesion is what the loose/static flag it replaces could not express. A
 * binary gives you either material that creeps forever on any rasterised slope,
 * or material that hangs unsupported in mid-air. A bond gives you material that
 * stays glued until something takes its neighbours away — and then a deficit
 * propagates outward through the pile, one ring per frame, as a collapse.
 *
 * Mirrored by `support_at` and `neighbour_support` in
 * `src/gpu/shaders/simulation.wgsl`.
 */
import { isBlocked } from "./geometry.js";
import { random01 } from "./prng.js";

/** Nothing can move: all three cells beneath are solid. */
export const SUPPORT_FIRM = 0;
/** Nothing directly below. Falls, if its bond does not hold it. */
export const SUPPORT_FALL = 1;
/** Standing on solid ground with an open diagonal. Slumps, given the chance. */
export const SUPPORT_SLUMP = 2;

/**
 * How many of the eight surrounding cells are solid.
 *
 * Outside the world counts as solid: the floor and the walls hold material in
 * rather than letting the edges of the world quietly drain away.
 *
 * The four orthogonal neighbours are counted first so a caller can stop early —
 * most of a solid world is interior rock whose bond is already satisfied by
 * them, and the diagonals are four loads that need never happen.
 *
 * @param {ArrayLike<number>} field
 * @param {number} x @param {number} y
 * @param {{ width: number, height: number }} world
 * @returns {{ orthogonal: number, total: number }}
 */
export function neighbourSupport(field, x, y, world) {
  const { width, height } = world;
  /** @param {number} dx @param {number} dy @returns {number} */
  const solid = (dx, dy) => (isBlocked(field, x + dx, y + dy, width, height) ? 1 : 0);
  const orthogonal = solid(-1, 0) + solid(1, 0) + solid(0, -1) + solid(0, 1);
  const diagonal = solid(-1, -1) + solid(1, -1) + solid(-1, 1) + solid(1, 1);
  return { orthogonal, total: orthogonal + diagonal };
}

/**
 * Whether a cell's neighbours are enough to hold it.
 *
 * @param {number} support neighbours present
 * @param {number} bond neighbours required
 * @returns {boolean}
 */
export function isHeld(support, bond) {
  return support >= bond;
}

/**
 * @typedef {{ support: number, direction: number }} Support
 *   `direction` is -1, 0 or 1: which way the pixel would go if it moved.
 */

/**
 * Which way a released pixel goes. A pixel is held up by the three cells
 * beneath it, not one: nothing below and it drops; solid below but an open
 * diagonal and it can slump sideways into the gap, which is the difference
 * between a heap and a stack of columns.
 *
 * @param {ArrayLike<number>} field
 * @param {number} x @param {number} y
 * @param {{ width: number, height: number }} world
 * @param {number} seed decides the direction when both diagonals are open
 * @returns {Support}
 */
export function supportAt(field, x, y, world, seed) {
  const { width, height } = world;
  if (!isBlocked(field, x, y - 1, width, height)) return { support: SUPPORT_FALL, direction: 0 };
  const left = !isBlocked(field, x - 1, y - 1, width, height);
  const right = !isBlocked(field, x + 1, y - 1, width, height);
  if (!left && !right) return { support: SUPPORT_FIRM, direction: 0 };
  return { support: SUPPORT_SLUMP, direction: chooseDirection(left, right, seed) };
}

/**
 * Ties are broken by the seed, or every heap in the world would lean the same
 * way.
 *
 * @param {boolean} left @param {boolean} right @param {number} seed
 * @returns {number} -1, 0 or 1
 */
export function chooseDirection(left, right, seed) {
  if (left && right) return random01(seed) < 0.5 ? -1 : 1;
  if (left) return -1;
  if (right) return 1;
  return 0;
}

/**
 * Whether a released pixel actually lets go this frame. Falling is not
 * optional; slumping sideways is, and its probability is the "flow" knob.
 *
 * @param {number} support @param {number} chance @param {number} seed
 * @returns {boolean}
 */
export function releases(support, chance, seed) {
  if (support === SUPPORT_FALL) return true;
  if (support !== SUPPORT_SLUMP) return false;
  return random01(seed) < chance;
}

/**
 * Lateral direction for a pixel that has just landed on something solid, so it
 * rolls off a heap instead of stacking into a needle. Unlike {@link releases}
 * this is not a probability: it is collision response, and it always applies.
 *
 * @param {ArrayLike<number>} field
 * @param {number} x @param {number} y
 * @param {{ width: number, height: number }} world
 * @param {number} seed
 * @returns {number} -1, 0 or 1
 */
export function slideDirection(field, x, y, world, seed) {
  const { width, height } = world;
  if (!isBlocked(field, x, y - 1, width, height)) return 0;
  return chooseDirection(
    !isBlocked(field, x - 1, y - 1, width, height),
    !isBlocked(field, x + 1, y - 1, width, height),
    seed,
  );
}
