/**
 * A lemming's brain, and how brains breed.
 *
 * Each lemming carries a tiny fixed-topology network — twelve senses, eight
 * hidden units, three actions — and there is no training in the gradient
 * sense at all. Brains are *evolved*: every generation the best scorers keep
 * their weights, everyone else is replaced by a mutated cross of two of them,
 * and a lemming that dies mid-generation comes back as a clone of a current
 * elite. Only successful nets are ever respawned.
 *
 * Inference runs on the GPU, inside `step_agents`, because a forward pass this
 * small costs less per lemming than the sand rule costs per cell, and there are
 * only a few thousand lemmings. Selection and mutation run here, once a
 * generation, on a readback of a couple of megabytes. Everything is a pure
 * function of its seed so a run can be replayed.
 *
 * Mirrored by `think` and the `BRAIN_*` and `INPUT_*` constants in
 * `src/gpu/shaders/simulation.wgsl`; the contract test keeps them in step.
 */
import { hashU32, random01 } from "./prng.js";

// --- Topology ----------------------------------------------------------------

export const INPUTS = 12;
export const HIDDEN = 8;
export const OUTPUTS = 3;

/** Weight layout: W1 (hidden x inputs, row-major), b1, W2 (outputs x hidden), b2. */
export const BRAIN_W1 = 0;
export const BRAIN_B1 = BRAIN_W1 + HIDDEN * INPUTS;
export const BRAIN_W2 = BRAIN_B1 + HIDDEN;
export const BRAIN_B2 = BRAIN_W2 + OUTPUTS * HIDDEN;
/** Floats per brain. 131: it lives inline in the agent record, after the body. */
export const BRAIN_FLOATS = BRAIN_B2 + OUTPUTS;

// --- Senses ------------------------------------------------------------------
//
// What a lemming can feel, in the order the shader fills them in. Everything is
// in the lemming's own frame — "ahead" is the way it faces — so a brain does
// not have to learn the world twice over, once for each direction.

/** Always one. Gives every unit a bias without a separate weight vector. */
export const INPUT_BIAS = 0;
/** Nothing under the cell ahead: a pit, a cliff, the end of a tunnel. */
export const INPUT_DROP_AHEAD = 1;
/** The cell ahead is solid. */
export const INPUT_AHEAD = 2;
/** The cell above the one ahead is solid: too tall to step up. */
export const INPUT_ABOVE_AHEAD = 3;
/** How hard the cell ahead is to dig: 0 open, up to 1 for bedrock. */
export const INPUT_HARDNESS = 4;
/** Water within a few cells ahead. Fatal, so worth a sense of its own. */
export const INPUT_WATER = 5;
/** -1 or 1, so a brain can tell which way it is walking along the world. */
export const INPUT_FACING = 6;
/** Direction to the nearest gold, ahead-positive, unit length; zero out of range. */
export const INPUT_SCENT_X = 7;
export const INPUT_SCENT_Y = 8;
/** How near that gold is: 1 on top of it, 0 at the edge of range or beyond. */
export const INPUT_SCENT_NEAR = 9;
/** Gold in one of the two cells ahead. */
export const INPUT_GOLD_AHEAD = 10;
/** Whether it is currently digging, so a brain can learn to keep at it. */
export const INPUT_DIGGING = 11;

// --- Actions -----------------------------------------------------------------

export const ACTION_WALK = 0;
export const ACTION_DIG = 1;
export const ACTION_TURN = 2;

// --- Fitness -----------------------------------------------------------------

/** Score per cell of gold dug through. What the whole thing is for. */
export const GOLD_REWARD = 50;
/**
 * Score per cell of closest approach to gold. Gold is rare, so without this
 * every brain in an early generation scores zero and there is nothing to select
 * on; a brain that got nearer than it had ever been is rewarded for it.
 */
export const APPROACH_REWARD = 1;
/**
 * Score per cell dug, gold or not. Small on purpose: a constant digger earns a
 * few hundred over a generation, about what approaching gold is worth and far
 * short of one nugget — enough to make tunnelling a habit worth keeping, not
 * enough to make it the point.
 */
export const DIG_REWARD = 0.02;
/** Taken off for drowning or being smashed. */
export const DEATH_PENALTY = 200;
/** How far, in cells, a lemming can smell gold. Approach is rewarded inside it. */
export const SCENT_RANGE = 1024;
/** Frames a decision is held before the brain is asked again. */
export const DECISION_HOLD = 4;
/**
 * What a lemming's nearest-ever distance to gold is set to when it is spawned.
 * Negative means "not yet measured": the first frame it stands on something
 * sets it, without reward. Measured from the sky instead, every lemming was
 * paid seven hundred-odd points for falling to the ground — the same for all
 * of them, which left nothing to select on.
 */
export const CLOSEST_UNSET = -1;
/** Initial weights are uniform in ±this. */
export const WEIGHT_SPREAD = 1;

// --- Inference ---------------------------------------------------------------

/**
 * One forward pass. Hidden units are `tanh`; outputs are raw scores and the
 * action is whichever is largest.
 *
 * @param {ArrayLike<number>} weights
 * @param {ArrayLike<number>} inputs `INPUTS` senses
 * @param {number} [offset] where this brain starts in `weights`
 * @returns {Float32Array} `OUTPUTS` scores
 */
export function forward(weights, inputs, offset = 0) {
  const hidden = new Float32Array(HIDDEN);
  for (let h = 0; h < HIDDEN; h += 1) {
    let sum = weights[offset + BRAIN_B1 + h];
    for (let k = 0; k < INPUTS; k += 1) sum += weights[offset + BRAIN_W1 + h * INPUTS + k] * inputs[k];
    hidden[h] = Math.tanh(sum);
  }
  const outputs = new Float32Array(OUTPUTS);
  for (let o = 0; o < OUTPUTS; o += 1) {
    let sum = weights[offset + BRAIN_B2 + o];
    for (let h = 0; h < HIDDEN; h += 1) sum += weights[offset + BRAIN_W2 + o * HIDDEN + h] * hidden[h];
    outputs[o] = sum;
  }
  return outputs;
}

/**
 * @param {ArrayLike<number>} outputs
 * @returns {number} the action with the highest score; the first on a tie
 */
export function decide(outputs) {
  let best = 0;
  for (let o = 1; o < OUTPUTS; o += 1) if (outputs[o] > outputs[best]) best = o;
  return best;
}

// --- Breeding ----------------------------------------------------------------

/**
 * @param {number} seed
 * @param {Float32Array} [target] where to write; a fresh brain by default
 * @param {number} [offset]
 * @returns {Float32Array} `target`
 */
export function randomBrain(seed, target = new Float32Array(BRAIN_FLOATS), offset = 0) {
  for (let k = 0; k < BRAIN_FLOATS; k += 1) {
    target[offset + k] = (random01(hashU32(seed * 7919 + k)) * 2 - 1) * WEIGHT_SPREAD;
  }
  return target;
}

/**
 * Perturbs about `rate` of the weights by a roughly bell-shaped nudge of
 * `strength`, leaving the rest exactly as they were.
 *
 * @param {ArrayLike<number>} weights one brain
 * @param {number} seed
 * @param {{ rate: number, strength: number }} options
 * @returns {Float32Array} a new brain
 */
export function mutate(weights, seed, { rate, strength }) {
  const child = new Float32Array(BRAIN_FLOATS);
  for (let k = 0; k < BRAIN_FLOATS; k += 1) {
    const roll = hashU32(seed * 104729 + k * 3);
    child[k] = weights[k];
    if (random01(roll) >= rate) continue;
    // Two uniforms summed: triangular, so small nudges are common and large
    // ones rare, without needing a real normal.
    const nudge = random01(hashU32(roll + 1)) + random01(hashU32(roll + 2)) - 1;
    child[k] += nudge * strength;
  }
  return child;
}

/**
 * Each weight from one parent or the other, decided per weight.
 *
 * @param {ArrayLike<number>} a @param {ArrayLike<number>} b
 * @param {number} seed
 * @returns {Float32Array}
 */
export function crossover(a, b, seed) {
  const child = new Float32Array(BRAIN_FLOATS);
  for (let k = 0; k < BRAIN_FLOATS; k += 1) {
    child[k] = random01(hashU32(seed * 15485863 + k)) < 0.5 ? a[k] : b[k];
  }
  return child;
}

/**
 * Slot indices from best score to worst. Ties keep slot order, so the result
 * is a pure function of the scores.
 *
 * @param {ArrayLike<number>} scores
 * @returns {number[]}
 */
export function rankByScore(scores) {
  return Array.from({ length: scores.length }, (_, i) => i)
    .sort((i, j) => (scores[j] - scores[i]) || (i - j));
}

/**
 * @typedef {{ eliteFraction: number, mutationRate: number, mutationStrength: number }} EvolutionOptions
 */

/**
 * Breeds the next generation.
 *
 * The elite keep their slots and their weights untouched, so the elite indices
 * stay valid for the GPU, which clones one of them into any lemming that dies
 * before the generation is out. Every other slot becomes the mutated cross of
 * two elites chosen at random.
 *
 * @param {Float32Array} brains `n * BRAIN_FLOATS`, brain `i` at `i * BRAIN_FLOATS`
 * @param {ArrayLike<number>} scores one per brain
 * @param {number} seed
 * @param {EvolutionOptions} options
 * @returns {{ brains: Float32Array, elites: Uint32Array }} new brains and who survived
 */
export function nextGeneration(brains, scores, seed, { eliteFraction, mutationRate, mutationStrength }) {
  const count = scores.length;
  if (brains.length !== count * BRAIN_FLOATS) {
    throw new Error(`Expected ${count * BRAIN_FLOATS} weights for ${count} brains, got ${brains.length}.`);
  }
  const eliteCount = Math.max(1, Math.min(count, Math.round(count * eliteFraction)));
  const elites = Uint32Array.from(rankByScore(scores).slice(0, eliteCount));
  const survivor = new Set(elites);
  const next = new Float32Array(brains.length);
  const brainOf = (/** @type {number} */ slot) => brains.subarray(slot * BRAIN_FLOATS, (slot + 1) * BRAIN_FLOATS);
  for (let slot = 0; slot < count; slot += 1) {
    if (survivor.has(slot)) {
      next.set(brainOf(slot), slot * BRAIN_FLOATS);
      continue;
    }
    const roll = hashU32(seed * 2654435761 + slot);
    const mother = elites[roll % eliteCount];
    const father = elites[hashU32(roll ^ 0x9e3779b9) % eliteCount];
    const child = mutate(crossover(brainOf(mother), brainOf(father), roll), roll ^ 0x5bd1, {
      rate: mutationRate,
      strength: mutationStrength,
    });
    next.set(child, slot * BRAIN_FLOATS);
  }
  return { brains: next, elites };
}
