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
import { cellBond, isOccupied, isVoid, isWater } from "./field-format.js";
import { RUBBLE_BOND } from "./palette.js";
import { cellIndex, inBounds, isBlocked } from "./geometry.js";
import { random01 } from "./prng.js";

/** Nothing can move: all three cells beneath are solid. */
export const SUPPORT_FIRM = 0;
/** Nothing directly below. Falls, if its bond does not hold it. */
export const SUPPORT_FALL = 1;
/** Standing on solid ground with an open diagonal. Slumps, given the chance. */
export const SUPPORT_SLUMP = 2;

/**
 * The bond at which material stops being a solid and becomes grains.
 *
 * Anything that needs as many neighbours as rubble does — rubble, dirt, sand,
 * gravel — is a granular material. On land its bond is what holds a heap
 * together. In water it has no cohesion at all: a raft of sand does not float
 * because its grains are touching, it sinks grain by grain. Stone, needing two,
 * is a solid and keeps its cohesion — a rock ledge over a flooded pocket stays a
 * ledge.
 */
export const GRANULAR_BOND = RUBBLE_BOND;

/**
 * Whether a neighbouring cell holds anything up.
 *
 * Outside the world counts as solid: the floor and the walls hold material in
 * rather than letting the edges of the world quietly drain away.
 *
 * **Water holds nothing up.** It is occupied, and it blocks movement, but it
 * bears no load — which is the entire mechanism by which things sink through
 * it. A grain resting on a pool has three water cells beneath it, and counting
 * those as support is what made sand float like a raft. Discount them and the
 * cohesion test the grain already runs answers "not held", so it lets go, and
 * the only new rule needed is what it does then: see {@link displacesWater}.
 *
 * **The placeholder holds everything up.** It is water's mirror image: it stops
 * nothing, but it bears load, which is what keeps a tunnel's roof where it is.
 * So this is deliberately not {@link isBlocked} — the two questions "can a
 * pixel move into it?" and "does it hold its neighbours?" have different
 * answers for both of those materials.
 *
 * @param {ArrayLike<number>} field
 * @param {number} x @param {number} y
 * @param {{ width: number, height: number }} world
 * @returns {boolean}
 */
export function isSupporting(field, x, y, world) {
  const { width, height } = world;
  if (x < 0 || x >= width || y < 0) return true;
  if (y >= height) return false;
  const word = field[cellIndex(x, y, width)];
  return isOccupied(word) && !isWater(word);
}

/**
 * How many of the eight surrounding cells hold this one up.
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
  /** @param {number} dx @param {number} dy @returns {number} */
  const solid = (dx, dy) => (isSupporting(field, x + dx, y + dy, world) ? 1 : 0);
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
 * Where water goes next: straight down, then down-diagonally, then — under
 * pressure — flat sideways.
 *
 * That last step is the whole difference between water and sand. Sand needs an
 * opening *below* something before it will move, which is why it heaps; water
 * will shoulder its way along a level floor, so a pool spreads until it finds
 * its own level and then stops. Stopping matters as much as moving: with
 * nowhere to go it stays exactly where it is, which is what makes a still pool
 * still rather than a permanent churn.
 *
 * "Under pressure" means water directly above. Without that condition the
 * surface of every pool is a partial row of cells each with an open side, and
 * they slide back and forth for ever; with it a lone film of water is already
 * level, and a pool levels itself from below as buried cells are squeezed out
 * sideways and the cells above them drop.
 *
 * @param {ArrayLike<number>} field
 * @param {number} x @param {number} y
 * @param {{ width: number, height: number }} world
 * @param {number} seed breaks ties between two open sides
 * @returns {{ x: number, y: number }} zero when there is nowhere to go
 */
export function waterFlow(field, x, y, world, seed) {
  const { width, height } = world;
  /** @param {number} dx @param {number} dy @returns {boolean} */
  const open = (dx, dy) => !isBlocked(field, x + dx, y + dy, width, height);
  if (open(0, -1)) return { x: 0, y: -1 };
  const downLeft = open(-1, -1);
  const downRight = open(1, -1);
  if (downLeft || downRight) return { x: chooseDirection(downLeft, downRight, seed), y: -1 };
  const above = y + 1 < height && isWater(field[cellIndex(x, y + 1, width)]);
  if (!above) return { x: 0, y: 0 };
  const left = open(-1, 0);
  const right = open(1, 0);
  if (left || right) return { x: chooseDirection(left, right, seed), y: 0 };
  return { x: 0, y: 0 };
}

/**
 * Whether a cell can trade places with water directly beneath it — which is
 * what sinking is. Sand and water simply switch: the grain takes the cell below
 * and the water takes the cell it left, one cell a frame, conserving both.
 *
 * Granular material always sinks: see {@link GRANULAR_BOND}. For a solid the
 * question is the one cohesion already answers, and because
 * {@link isSupporting} discounts water the answer for a lone stone resting on
 * a pool is "nothing is holding this" — it goes under — while a rock ledge with
 * neighbours of its own does not. Bedrock is asked for no neighbours at all,
 * so it is held by definition and stands in the water.
 *
 * @param {ArrayLike<number>} field
 * @param {number} x @param {number} y
 * @param {{ width: number, height: number }} world
 * @returns {boolean}
 */
export function displacesWater(field, x, y, world) {
  const { width, height } = world;
  if (!inBounds(x, y, width, height) || !inBounds(x, y - 1, width, height)) return false;
  const word = field[cellIndex(x, y, width)];
  if (word === 0 || isWater(word) || isVoid(word)) return false;
  if (!isWater(field[cellIndex(x, y - 1, width)])) return false;
  const bond = cellBond(word);
  if (bond >= GRANULAR_BOND) return true;
  return !isHeld(neighbourSupport(field, x, y, world).total, bond);
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
