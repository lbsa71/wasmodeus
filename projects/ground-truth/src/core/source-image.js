/**
 * The static image the simulation eats from and settles back into.
 *
 * The default scene is generated rather than loaded so the demo has no asset
 * dependency, and it is deliberately *gap-free* below every solid: the only
 * thing that starts the erosion is the fountain intake at the bottom, which
 * then undermines its way upwards. Drop in your own picture to watch the same
 * rules chew through it instead.
 */
import { packCell } from "./field-format.js";

/** @typedef {import("./field-format.js").Field} Field */
import { cellIndex } from "./geometry.js";
import { random01 } from "./prng.js";

// The world has to hold comfortably more pixels than the pool, or the image
// runs out of material before the pool fills and "a million in motion" is
// unreachable for reasons that have nothing to do with the pool.
export const DEFAULT_WORLD_WIDTH = 2048;
export const DEFAULT_WORLD_HEIGHT = 1152;
/** Source pixels at or below this alpha are treated as absent, not as black. */
export const ALPHA_THRESHOLD = 128;

/**
 * @param {number} value @param {number} low @param {number} high
 * @returns {number}
 */
function clamp(value, low, high) {
  return Math.min(high, Math.max(low, value));
}

/**
 * @param {{ width: number, height: number, seed?: number }} options
 * @returns {Field} a `width * height` field, row 0 at the bottom
 */
export function createSourceField({ width, height, seed = 1 }) {
  const field = new Uint32Array(width * height);
  const groundTop = Math.round(height * 0.45);

  for (let y = 0; y < groundTop; y += 1) {
    const depth = 1 - y / groundTop;
    for (let x = 0; x < width; x += 1) {
      const grain = random01((y * width + x) ^ (seed * 0x9e3779b9)) * 26 - 13;
      const r = clamp(Math.round(58 + depth * 62 + grain), 0, 255);
      const g = clamp(Math.round(44 + depth * 40 + grain), 0, 255);
      const b = clamp(Math.round(38 + depth * 24 + grain), 0, 255);
      field[cellIndex(x, y, width)] = packCell(r, g, b);
    }
  }

  for (const tower of defaultTowers(width, height, groundTop)) {
    fillTower(field, width, height, tower, seed);
  }
  return field;
}

/**
 * Blocks standing on the ground, each a solid column so nothing is unsupported
 * before the fountain starts digging.
 *
 * @param {number} width @param {number} height @param {number} groundTop
 * @returns {{ x: number, w: number, h: number, hue: [number, number, number] }[]}
 */
export function defaultTowers(width, height, groundTop) {
  const unit = width / 16;
  /** @type {{ x: number, w: number, h: number, hue: [number, number, number], base?: number }[]} */
  const towers = [
    { x: Math.round(unit * 1.5), w: Math.round(unit * 2.2), h: Math.round(height * 0.30), hue: [196, 86, 74] },
    { x: Math.round(unit * 4.4), w: Math.round(unit * 1.4), h: Math.round(height * 0.46), hue: [232, 168, 62] },
    { x: Math.round(unit * 6.6), w: Math.round(unit * 3.0), h: Math.round(height * 0.22), hue: [74, 158, 196] },
    { x: Math.round(unit * 10.2), w: Math.round(unit * 1.8), h: Math.round(height * 0.38), hue: [128, 196, 118] },
    { x: Math.round(unit * 12.6), w: Math.round(unit * 2.6), h: Math.round(height * 0.26), hue: [186, 118, 208] },
  ];
  return towers.map((tower) => ({ ...tower, base: groundTop }));
}

/**
 * @param {Field} field @param {number} width @param {number} height
 * @param {{ x: number, w: number, h: number, hue: [number, number, number], base?: number }} tower
 * @param {number} seed
 */
function fillTower(field, width, height, tower, seed) {
  const base = tower.base ?? 0;
  const [hr, hg, hb] = tower.hue;
  for (let y = base; y < Math.min(height, base + tower.h); y += 1) {
    for (let x = tower.x; x < Math.min(width, tower.x + tower.w); x += 1) {
      const grain = random01((x * 7919 + y * 104729) ^ seed) * 34 - 17;
      field[cellIndex(x, y, width)] = packCell(
        clamp(Math.round(hr + grain), 0, 255),
        clamp(Math.round(hg + grain), 0, 255),
        clamp(Math.round(hb + grain), 0, 255),
      );
    }
  }
}

/**
 * Converts top-down RGBA source pixels into a bottom-up field, dropping
 * anything transparent — alpha is not stored, so a see-through pixel is simply
 * not part of the image.
 *
 * @param {{ width: number, height: number, data: ArrayLike<number> }} image
 * @param {{ width: number, height: number, offsetX?: number, offsetY?: number, alphaThreshold?: number }} target
 * @returns {Field}
 */
export function fieldFromImageData(image, target) {
  const field = new Uint32Array(target.width * target.height);
  const offsetX = target.offsetX ?? 0;
  const offsetY = target.offsetY ?? 0;
  const threshold = target.alphaThreshold ?? ALPHA_THRESHOLD;
  for (let row = 0; row < image.height; row += 1) {
    const y = offsetY + (image.height - 1 - row);
    if (y < 0 || y >= target.height) continue;
    for (let column = 0; column < image.width; column += 1) {
      const x = offsetX + column;
      if (x < 0 || x >= target.width) continue;
      const source = (row * image.width + column) * 4;
      if (image.data[source + 3] < threshold) continue;
      field[cellIndex(x, y, target.width)] = packCell(
        image.data[source],
        image.data[source + 1],
        image.data[source + 2],
      );
    }
  }
  return field;
}
