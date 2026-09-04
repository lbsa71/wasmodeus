/**
 * Cell encoding shared by the static field, the moving-pixel overlay and the
 * WGSL simulation. A cell word is either exactly `EMPTY` or an occupied cell
 * carrying 24 bits of colour plus bookkeeping bits.
 *
 * Bit 24 (`OCCUPIED_BIT`) is always set on an occupied cell so that a pure
 * black pixel is still distinguishable from empty space. Alpha is deliberately
 * not stored: a transparent source pixel is simply absent from the field.
 */
export const EMPTY = 0;
/** Marks a word as a real cell even when its colour bits are all zero. */
export const OCCUPIED_BIT = 0x01000000;
/** Set by a moving pixel that struck this cell; the emit pass releases it. */
export const DISLODGE_BIT = 0x80000000;
/** Low 24 bits: `r | g << 8 | b << 16`. */
export const COLOR_MASK = 0x00ffffff;

/**
 * A whole world of cells, row 0 at the bottom. The explicit `ArrayBuffer`
 * parameter is what lets the array be handed straight to `writeBuffer`.
 *
 * @typedef {Uint32Array<ArrayBuffer>} Field
 */

/**
 * @param {number} r @param {number} g @param {number} b
 * @returns {number}
 */
export function packCell(r, g, b) {
  return (OCCUPIED_BIT | ((b & 255) << 16) | ((g & 255) << 8) | (r & 255)) >>> 0;
}

/**
 * @param {number} word
 * @returns {{ r: number, g: number, b: number }}
 */
export function unpackCell(word) {
  return { r: word & 255, g: (word >>> 8) & 255, b: (word >>> 16) & 255 };
}

/** @param {number} word @returns {boolean} */
export function isOccupied(word) {
  return (word >>> 0) !== EMPTY;
}

/** @param {number} word @returns {boolean} */
export function isDislodged(word) {
  return ((word >>> 0) & DISLODGE_BIT) !== 0;
}

/** @param {number} word @returns {number} */
export function markDislodged(word) {
  return ((word >>> 0) | DISLODGE_BIT) >>> 0;
}

/** @param {number} word @returns {number} */
export function clearDislodged(word) {
  return ((word >>> 0) & ~DISLODGE_BIT) >>> 0;
}

/** @param {number} word @returns {number} the 24-bit colour payload */
export function cellColor(word) {
  return (word >>> 0) & COLOR_MASK;
}

/**
 * A settled cell re-entering the field keeps its colour and drops every
 * bookkeeping bit except occupancy.
 *
 * @param {number} color 24-bit colour payload
 * @returns {number}
 */
export function settledCell(color) {
  return ((color & COLOR_MASK) | OCCUPIED_BIT) >>> 0;
}
