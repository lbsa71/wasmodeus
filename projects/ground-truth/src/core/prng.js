/**
 * Deterministic 32-bit integer hash, mirrored verbatim by `hash_u32` in
 * `src/gpu/shaders/simulation.wgsl`. The CPU copy exists so the emission and
 * fountain behaviour can be reasoned about (and tested) without a GPU.
 *
 * @param {number} value
 * @returns {number} an unsigned 32-bit hash
 */
export function hashU32(value) {
  let x = value >>> 0;
  x = (x ^ (x >>> 16)) >>> 0;
  x = Math.imul(x, 0x7feb352d) >>> 0;
  x = (x ^ (x >>> 15)) >>> 0;
  x = Math.imul(x, 0x846ca68b) >>> 0;
  x = (x ^ (x >>> 16)) >>> 0;
  return x;
}

/**
 * Uniform value in `[0, 1)` derived from a seed. Mirrors `rand01` in WGSL.
 *
 * @param {number} seed
 * @returns {number}
 */
export function random01(seed) {
  return (hashU32(seed) & 0x00ffffff) / 0x01000000;
}
