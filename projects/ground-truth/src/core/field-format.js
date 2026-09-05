/**
 * Cell encoding shared by the static field, the moving-pixel overlay and the
 * WGSL simulation. A cell word is either exactly `EMPTY` or an occupied cell
 * carrying 24 bits of colour plus its bond and some bookkeeping.
 *
 * Bit 24 (`OCCUPIED_BIT`) is always set on an occupied cell so that a pure
 * black pixel is still distinguishable from empty space. Alpha is deliberately
 * not stored: a transparent source pixel is simply absent from the field.
 *
 * Bits 25-28 hold the **bond**: how many of a cell's eight neighbours it needs
 * in order to stay put. It replaces the old loose/static flag, which was a
 * binary between material that flowed constantly and material that could hang
 * in mid-air forever. See `src/core/sand.js`.
 */
export const EMPTY = 0;
/** Marks a word as a real cell even when its colour bits are all zero. */
export const OCCUPIED_BIT = 0x01000000;
/** Set by a moving pixel that struck this cell; the emit pass releases it. */
export const DISLODGE_BIT = 0x80000000;
/** Low 24 bits: `r | g << 8 | b << 16`. */
export const COLOR_MASK = 0x00ffffff;
/** Bits 25-28: neighbours required to stay put, 0 to 15. */
export const BOND_SHIFT = 25;
export const BOND_MASK = 0x1e000000;
/** A cell has at most eight neighbours, so this can never be satisfied. */
export const MAX_BOND = 15;
/**
 * Water. A bond of fifteen is a bond eight neighbours can never meet, so water
 * is held by nothing anywhere, ever — no arrangement of the world can support
 * it. Everything that already asks "is this cell held?" therefore says no for
 * water without being told about water at all; only the question of *which way*
 * it goes needs a rule of its own. See `waterFlow` in `src/core/sand.js`.
 */
export const WATER_BOND = MAX_BOND;

/** @param {number} word @returns {boolean} */
export function isWater(word) {
  return cellBond(word) === WATER_BOND;
}
/** Needs no neighbours at all: bedrock, and nothing else moves it but a blast. */
export const IMMOVABLE = 0;
/** What a pixel carries with it while airborne: its colour and its bond. */
export const MATERIAL_MASK = 0x1effffff;

/**
 * A whole world of cells, row 0 at the bottom. The explicit `ArrayBuffer`
 * parameter is what lets the array be handed straight to `writeBuffer`.
 *
 * @typedef {Uint32Array<ArrayBuffer>} Field
 */

/**
 * @param {number} r @param {number} g @param {number} b
 * @param {number} [bond] neighbours required to stay put; 0 never moves
 * @returns {number}
 */
export function packCell(r, g, b, bond = IMMOVABLE) {
  return (OCCUPIED_BIT
    | ((Math.min(MAX_BOND, Math.max(0, bond)) << BOND_SHIFT) >>> 0)
    | ((b & 255) << 16) | ((g & 255) << 8) | (r & 255)) >>> 0;
}

/**
 * @param {number} word
 * @returns {{ r: number, g: number, b: number }}
 */
export function unpackCell(word) {
  return { r: word & 255, g: (word >>> 8) & 255, b: (word >>> 16) & 255 };
}

/** @param {number} word @returns {number} neighbours this cell needs to stay put */
export function cellBond(word) {
  return ((word >>> 0) & BOND_MASK) >>> BOND_SHIFT;
}

/**
 * @param {number} word @param {number} bond
 * @returns {number} the same cell with a different bond
 */
export function withBond(word, bond) {
  const clamped = Math.min(MAX_BOND, Math.max(0, bond));
  return (((word >>> 0) & ~BOND_MASK) | ((clamped << BOND_SHIFT) >>> 0)) >>> 0;
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

/** @param {number} word @returns {number} the cell without its transient bits */
export function material(word) {
  return ((word >>> 0) & MATERIAL_MASK) >>> 0;
}

/**
 * A settled cell re-entering the field keeps its colour but not its bond:
 * anything that has been thrown through the air lands as rubble, so blasted
 * stone does not re-freeze into cliff face that holds up a ceiling again.
 *
 * @param {number} payload colour plus bond, as carried by a pixel
 * @param {number} rubbleBond the bond debris settles with
 * @returns {number}
 */
export function settledCell(payload, rubbleBond) {
  return withBond(((payload & MATERIAL_MASK) | OCCUPIED_BIT) >>> 0, rubbleBond);
}
