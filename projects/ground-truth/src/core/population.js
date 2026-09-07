/**
 * A population of brains as a thing that can be saved and brought back.
 *
 * Evolution is slow and a page reload is not, so after every generation the
 * whole population — every brain, who the elite are, and how far it has got —
 * is handed to a store, and on the next visit it is picked up where it left
 * off. Nothing here knows about storage: this is the record's shape, its
 * checks, and how to fit a saved population to however many lemmings the
 * slider now asks for.
 */
import { BRAIN_FLOATS, OLD_TOPOLOGIES, layoutFor, migrateBrain, mutate } from "./brain.js";
import { hashU32 } from "./prng.js";

/**
 * Bumped whenever the record's shape or the brain's topology changes. Older
 * records are migrated on the way in — see `migrateBrain` and
 * `OLD_TOPOLOGIES` — rather than refused.
 */
export const POPULATION_VERSION = 3;

/**
 * @typedef {{
 *   version: number, generation: number, count: number,
 *   brains: Float32Array, elites: Uint32Array, best: number, mean: number, savedAt: number
 * }} SavedPopulation
 */

/**
 * @param {{ generation: number, count: number, brains: Float32Array, elites: Uint32Array, best: number, mean: number }} population
 * @param {number} [savedAt]
 * @returns {SavedPopulation}
 */
export function packPopulation({ generation, count, brains, elites, best, mean }, savedAt = Date.now()) {
  if (brains.length !== count * BRAIN_FLOATS) {
    throw new Error(`Expected ${count * BRAIN_FLOATS} weights for ${count} brains, got ${brains.length}.`);
  }
  return { version: POPULATION_VERSION, generation, count, brains, elites, best, mean, savedAt };
}

/**
 * Checks a record that came back from storage before anything trusts it: the
 * right version, a whole number of brains, elites that point at real slots,
 * and weights that are all finite.
 *
 * @param {unknown} record
 * @returns {SavedPopulation}
 */
export function unpackPopulation(record) {
  if (!record || typeof record !== "object") throw new Error("No population in the record.");
  const saved = /** @type {Partial<SavedPopulation>} */ (record);
  const version = Number(saved.version);
  const shape = version === POPULATION_VERSION ? null : OLD_TOPOLOGIES[version];
  if (version !== POPULATION_VERSION && !shape) {
    throw new Error(`Population version ${saved.version} is not ${POPULATION_VERSION}.`);
  }
  let brains = saved.brains instanceof Float32Array ? saved.brains : new Float32Array(saved.brains ?? []);
  const elites = saved.elites instanceof Uint32Array ? saved.elites : new Uint32Array(saved.elites ?? []);
  const count = Number(saved.count);
  if (shape) {
    const old = layoutFor(shape).floats;
    if (!Number.isInteger(count) || count < 1 || brains.length !== count * old) {
      throw new Error(`A version-${version} population of ${count} needs ${count * old} weights, not ${brains.length}.`);
    }
    const migrated = new Float32Array(count * BRAIN_FLOATS);
    for (let i = 0; i < count; i += 1) migrated.set(migrateBrain(brains.subarray(i * old, (i + 1) * old), shape), i * BRAIN_FLOATS);
    brains = migrated;
  }
  if (!Number.isInteger(count) || count < 1 || brains.length !== count * BRAIN_FLOATS) {
    throw new Error(`A population of ${count} needs ${count * BRAIN_FLOATS} weights, not ${brains.length}.`);
  }
  for (let k = 0; k < brains.length; k += 1) {
    if (!Number.isFinite(brains[k])) throw new Error(`Weight ${k} is not a number.`);
  }
  if (elites.some((slot) => slot >= count)) throw new Error("An elite points outside the population.");
  return {
    version: POPULATION_VERSION,
    generation: Math.max(0, Math.floor(Number(saved.generation) || 0)),
    count,
    brains,
    elites,
    best: Number(saved.best) || 0,
    mean: Number(saved.mean) || 0,
    savedAt: Number(saved.savedAt) || 0,
  };
}

/**
 * Fits a population to a different number of lemmings.
 *
 * Fewer: the first `count` keep their brains and any elite beyond the end is
 * dropped. More: the extra slots are mutated copies of the existing brains,
 * taken in turn, so a bigger population starts from what was learned rather
 * than from noise. Elites stay valid either way; if none survive the cut,
 * everyone counts as elite until the next selection.
 *
 * @param {Float32Array} brains
 * @param {Uint32Array} elites
 * @param {number} count
 * @param {number} seed
 * @param {{ rate: number, strength: number }} [mutation]
 * @returns {{ brains: Float32Array, elites: Uint32Array }}
 */
export function resizePopulation(brains, elites, count, seed, mutation = { rate: 0.1, strength: 0.5 }) {
  const source = Math.floor(brains.length / BRAIN_FLOATS);
  if (source < 1) throw new Error("Cannot resize an empty population.");
  const next = new Float32Array(count * BRAIN_FLOATS);
  next.set(brains.subarray(0, Math.min(source, count) * BRAIN_FLOATS));
  for (let slot = source; slot < count; slot += 1) {
    const parent = slot % source;
    const child = mutate(brains.subarray(parent * BRAIN_FLOATS, (parent + 1) * BRAIN_FLOATS), hashU32(seed * 7919 + slot), mutation);
    next.set(child, slot * BRAIN_FLOATS);
  }
  let kept = elites.filter((slot) => slot < count);
  if (kept.length === 0) kept = Uint32Array.from({ length: count }, (_, i) => i);
  return { brains: next, elites: kept };
}
