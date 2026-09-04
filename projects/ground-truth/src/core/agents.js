/**
 * Lemmings.
 *
 * Small creatures that walk the world, tunnel through it, and occasionally sit
 * down and light a bomb. They are not part of the field — sand does not rest on
 * one — but they read it for every decision, so a tunnel one digs is a real
 * tunnel and a floor blown out from under one really drops it.
 *
 * "Sprite" is the right word for how they come apart. A lemming is drawn as a
 * little block of pixels, and when something hits it hard enough the block is
 * released into the particle pool: the creature decoheres into its own pixels
 * and those fall, pile and settle like anything else. It is the same trade the
 * rest of the simulation makes — hold together until something takes you apart.
 *
 * The rules here are mirrored by `step_agents` in
 * `src/gpu/shaders/simulation.wgsl`.
 */

/** Walking along, looking for somewhere to dig. */
export const MODE_WALK = 0;
/** Chewing through the world, one cell at a time. */
export const MODE_DIG = 1;
/** Sitting on a lit bomb, counting down. */
export const MODE_FUSE = 2;

/** Bits of the packed agent state word. */
export const AGENT_TIMER_MASK = 0x000000ff;
export const AGENT_FACING_BIT = 0x00000100;
export const AGENT_MODE_SHIFT = 9;
export const AGENT_MODE_MASK = 0x00000600;
export const AGENT_ALIVE_BIT = 0x00000800;
/** Widest a timer may count, being eight bits. */
export const MAX_AGENT_TIMER = 255;

/**
 * @typedef {{ alive: boolean, mode: number, facing: number, timer: number }} Agent
 */

/**
 * @param {Agent} agent
 * @returns {number} the packed state word
 */
export function packAgent({ alive, mode, facing, timer }) {
  return (
    (alive ? AGENT_ALIVE_BIT : 0)
    | ((mode << AGENT_MODE_SHIFT) & AGENT_MODE_MASK)
    | (facing > 0 ? AGENT_FACING_BIT : 0)
    | (Math.min(MAX_AGENT_TIMER, Math.max(0, Math.round(timer))) & AGENT_TIMER_MASK)
  ) >>> 0;
}

/**
 * @param {number} word
 * @returns {Agent}
 */
export function unpackAgent(word) {
  return {
    alive: (word & AGENT_ALIVE_BIT) !== 0,
    mode: (word & AGENT_MODE_MASK) >>> AGENT_MODE_SHIFT,
    // Facing is stored as a bit but used as a direction, so -1 or 1 never 0.
    facing: (word & AGENT_FACING_BIT) !== 0 ? 1 : -1,
    timer: word & AGENT_TIMER_MASK,
  };
}

/**
 * What a walking lemming does next, given what it can feel around it.
 *
 * The order matters. Nothing underfoot beats everything — a lemming whose floor
 * has just been dug away or blown out falls, whatever it was doing. Otherwise it
 * walks if the way is clear, steps up a single cell if it is not, and turns at
 * anything taller. That is the whole of it, and it is enough to make one follow
 * the contour of a cave.
 *
 * @param {{ ground: boolean, ahead: boolean, aboveAhead: boolean }} feel
 *   whether each of those cells is solid
 * @param {number} facing -1 or 1
 * @returns {{ action: "fall"|"walk"|"climb"|"turn", facing: number }}
 */
export function walkDecision({ ground, ahead, aboveAhead }, facing) {
  if (!ground) return { action: "fall", facing };
  if (!ahead) return { action: "walk", facing };
  if (!aboveAhead) return { action: "climb", facing };
  return { action: "turn", facing: -facing };
}

/**
 * Advances a countdown by one frame.
 *
 * @param {number} timer
 * @returns {{ timer: number, fired: boolean }}
 */
export function tick(timer) {
  if (timer <= 1) return { timer: 0, fired: true };
  return { timer: timer - 1, fired: false };
}

/**
 * How long a lemming keeps doing one thing before reconsidering. Deterministic
 * in the seed so a run can be replayed.
 *
 * @param {number} seed
 * @param {number} shortest @param {number} longest
 * @returns {number}
 */
export function timerFor(seed, shortest, longest) {
  const span = Math.max(0, longest - shortest);
  return Math.min(MAX_AGENT_TIMER, shortest + (span > 0 ? seed % (span + 1) : 0));
}
