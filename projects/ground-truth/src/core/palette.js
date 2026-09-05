/**
 * Materials the cave world is built from.
 *
 * `bond` is how many of a cell's eight neighbours it needs in order to stay
 * put — the whole of its mechanical character in one number. Low is strong:
 * stone holds a cave roof on two neighbours. High is weak: dry sand needs to be
 * nearly buried, so it runs off every edge it finds. Zero never moves at all.
 * See `src/core/sand.js`.
 *
 * `grain` is how far each pixel's colour is jittered, which is what stops a
 * seam of stone reading as a flat fill once it starts moving.
 */

/**
 * @typedef {{ rgb: [number, number, number], grain: number, bond: number }} Material
 */

/**
 * Debris settles with this bond: once thrown, everything behaves like gravel.
 *
 * Three, not more, and the reason is worth knowing. A lone grain resting on
 * flat ground has exactly three neighbours — the cells below-left, below and
 * below-right — because there is nothing beside it. Ask for four and a stray
 * pixel can never satisfy its bond wherever it lands, so it slides for ever and
 * the world never comes to rest. Three is the largest bond a single grain can
 * meet on its own, which is what makes a pile settle instead of creeping.
 */
export const RUBBLE_BOND = 3;

/** @type {Record<string, Material>} */
export const MATERIALS = {
  bedrock: { rgb: [26, 27, 34], grain: 8, bond: 0 },
  deepStone: { rgb: [52, 55, 68], grain: 12, bond: 2 },
  stone: { rgb: [78, 80, 92], grain: 16, bond: 2 },
  paleStone: { rgb: [104, 106, 116], grain: 16, bond: 2 },
  ore: { rgb: [196, 158, 78], grain: 22, bond: 2 },
  // Water. Bond 15 is unmeetable, so it flows wherever there is anywhere to
  // flow to and stops only when there is not.
  water: { rgb: [58, 132, 208], grain: 14, bond: 15 },
  gravel: { rgb: [96, 90, 84], grain: 20, bond: 5 },
  dirt: { rgb: [104, 74, 48], grain: 18, bond: 4 },
  sand: { rgb: [176, 152, 104], grain: 16, bond: 5 },
  topsoil: { rgb: [62, 52, 36], grain: 14, bond: 3 },
  // Everything that grows is rooted: a plant holds on with very little help,
  // which is what lets a vine hang off a ceiling and a tree keep its canopy.
  grass: { rgb: [86, 148, 62], grain: 22, bond: 1 },
  moss: { rgb: [64, 118, 88], grain: 20, bond: 1 },
  vine: { rgb: [58, 122, 74], grain: 18, bond: 1 },
  bark: { rgb: [78, 56, 38], grain: 14, bond: 1 },
  leaf: { rgb: [72, 132, 58], grain: 26, bond: 1 },
  capRed: { rgb: [172, 66, 62], grain: 18, bond: 1 },
  capViolet: { rgb: [134, 82, 158], grain: 18, bond: 1 },
  stalk: { rgb: [206, 196, 168], grain: 12, bond: 1 },
  glow: { rgb: [122, 208, 176], grain: 24, bond: 1 },
};

/** Names of everything that grows, for the vegetation census in the tests. */
export const VEGETATION = ["grass", "moss", "vine", "bark", "leaf", "capRed", "capViolet", "stalk", "glow"];
