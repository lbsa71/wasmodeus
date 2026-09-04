/**
 * Layout of the GPU counter block. It doubles as the free-slot ring's head and
 * tail, so a single readback drives both the debug panel and the fountain
 * servo. Every field is a 32-bit atomic.
 *
 * The live-pixel count is derived from `tail - head` rather than tallied by a
 * per-particle `atomicAdd`: a million threads contending on one counter costs
 * far more than the number is worth.
 */
export const COUNTER_WORDS = [
  "head",
  "tail",
  "popBudget",
  "emitted",
  "deposited",
  "dislodged",
  "undermined",
  "denied",
];
/** Padded past the 32 bytes of counters so the block stays 16-byte aligned. */
export const COUNTERS_BYTES = 48;
/** Counters reset by the `prepare` pass every frame; the rest are persistent. */
export const PER_FRAME_COUNTERS = ["emitted", "deposited", "dislodged", "undermined", "denied"];

/** @param {string} name @returns {number} word index of a counter */
export function counterIndex(name) {
  const index = COUNTER_WORDS.indexOf(name);
  if (index < 0) throw new Error(`Unknown counter: ${name}`);
  return index;
}

/**
 * @typedef {{
 *   head: number, tail: number, popBudget: number, emitted: number,
 *   deposited: number, dislodged: number, undermined: number, denied: number,
 *   moving: number, free: number, capacity: number, utilisation: number
 * }} CounterSnapshot
 */

/**
 * @param {ArrayLike<number>} words raw counter block read back from the GPU
 * @param {number} capacity current pool size
 * @returns {CounterSnapshot}
 */
export function decodeCounters(words, capacity) {
  /** @type {Record<string, number>} */
  const decoded = {};
  COUNTER_WORDS.forEach((name, index) => {
    // `popBudget` is signed: the emit pass drives it below zero on purpose.
    decoded[name] = name === "popBudget" ? (words[index] | 0) : (words[index] >>> 0);
  });
  // Ring indices are monotonic and wrap at 2^32; unsigned subtraction is exact.
  const free = Math.min(capacity, (decoded.tail - decoded.head) >>> 0);
  const moving = Math.max(0, capacity - free);
  return /** @type {CounterSnapshot} */ ({
    ...decoded,
    moving,
    free,
    capacity,
    utilisation: capacity > 0 ? moving / capacity : 0,
  });
}
