/**
 * Value noise, sampled from a coarse lattice.
 *
 * The world has tens of millions of cells, and evaluating fractal noise per
 * cell would cost hundreds of millions of hashes — seconds of blocked main
 * thread. Instead the fractal work happens once on a lattice a few times
 * coarser than the world, and each cell bilinearly interpolates it. Caves are
 * large features, so nothing is lost, and generation drops to a fraction of a
 * second.
 */
import { hashU32 } from "./prng.js";

/**
 * @typedef {{
 *   values: Float32Array, columns: number, rows: number, cellSize: number
 * }} NoiseField
 */

/** @param {number} x @param {number} y @param {number} seed @returns {number} in `[0, 1)` */
export function latticeValue(x, y, seed) {
  return (hashU32((hashU32(x * 0x1f1f1f1f + seed) ^ (y * 0x27d4eb2d)) >>> 0) & 0x00ffffff) / 0x01000000;
}

/**
 * Hermite fade, so interpolated noise has no visible lattice creases.
 *
 * @param {number} t @returns {number}
 */
export function smoothstep(t) {
  return t * t * (3 - 2 * t);
}

/**
 * One octave of value noise in lattice units.
 *
 * @param {number} x @param {number} y @param {number} seed
 * @returns {number} in `[0, 1]`
 */
export function valueNoise(x, y, seed) {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = smoothstep(x - x0);
  const fy = smoothstep(y - y0);
  const top = latticeValue(x0, y0 + 1, seed) * (1 - fx) + latticeValue(x0 + 1, y0 + 1, seed) * fx;
  const bottom = latticeValue(x0, y0, seed) * (1 - fx) + latticeValue(x0 + 1, y0, seed) * fx;
  return bottom * (1 - fy) + top * fy;
}

/**
 * Fractal sum of octaves, normalised back into `[0, 1]`.
 *
 * @param {number} x @param {number} y
 * @param {{ seed: number, octaves?: number, gain?: number, lacunarity?: number }} options
 * @returns {number}
 */
export function fbm(x, y, { seed, octaves = 4, gain = 0.5, lacunarity = 2 }) {
  let total = 0;
  let amplitude = 1;
  let range = 0;
  let frequency = 1;
  for (let octave = 0; octave < octaves; octave += 1) {
    total += valueNoise(x * frequency, y * frequency, seed + octave * 7919) * amplitude;
    range += amplitude;
    amplitude *= gain;
    frequency *= lacunarity;
  }
  return total / range;
}

/**
 * Bakes an fBm field onto a lattice covering a `width * height` world.
 *
 * @param {{
 *   width: number, height: number, cellSize: number, scale: number,
 *   seed: number, octaves?: number
 * }} options `cellSize` is world pixels per lattice step; `scale` is lattice
 *   steps per noise unit, so a larger scale means larger features.
 * @returns {NoiseField}
 */
export function createNoiseField({ width, height, cellSize, scale, seed, octaves = 4 }) {
  const columns = Math.ceil(width / cellSize) + 2;
  const rows = Math.ceil(height / cellSize) + 2;
  const values = new Float32Array(columns * rows);
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      values[row * columns + column] = fbm(column / scale, row / scale, { seed, octaves });
    }
  }
  return { values, columns, rows, cellSize };
}

/**
 * Bilinearly samples a baked field at world coordinates.
 *
 * @param {NoiseField} field @param {number} x @param {number} y
 * @returns {number}
 */
export function sampleField(field, x, y) {
  const { values, columns, rows, cellSize } = field;
  const fx = Math.min(columns - 1.001, Math.max(0, x / cellSize));
  const fy = Math.min(rows - 1.001, Math.max(0, y / cellSize));
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const tx = fx - x0;
  const ty = fy - y0;
  const base = y0 * columns + x0;
  const bottom = values[base] * (1 - tx) + values[base + 1] * tx;
  const top = values[base + columns] * (1 - tx) + values[base + columns + 1] * tx;
  return bottom * (1 - ty) + top * ty;
}

/**
 * A one-dimensional slice, for things like a surface skyline.
 *
 * @param {NoiseField} field @param {number} x
 * @returns {number}
 */
export function sampleRidge(field, x) {
  return sampleField(field, x, 0);
}
