/**
 * Procedural cave world.
 *
 * A rolling surface with soil and grass, a tunnel-and-cavern system carved out
 * of the rock beneath it, and things growing on both. Caves are only cut into
 * stone, never into the loose soil above them, so the world starts stable:
 * nothing is unsupported until something blows a hole in it.
 *
 * All of it is a pure function of the seed.
 */
import { WATER_BOND, cellBond, isOccupied, packCell, withBond } from "./field-format.js";
import { cellIndex } from "./geometry.js";
import { neighbourSupport } from "./sand.js";
import { MATERIALS } from "./palette.js";
import { createNoiseField, sampleField } from "./noise.js";
import { random01 } from "./prng.js";

export const DEFAULT_WORLD_WIDTH = 6144;
export const DEFAULT_WORLD_HEIGHT = 3456;

/** Fractions of the world height. */
const SURFACE_LEVEL = 0.87;
const SURFACE_RELIEF = 0.055;
const BEDROCK_LEVEL = 0.03;

/**
 * Every feature size is a fraction of the world, never a pixel count. Fixed
 * sizes look like a cave system at one scale and like gravel at another.
 */
const FEATURE = {
  ridge: 0.035,
  trunk: 0.021,
  canopy: 0.009,
  spacing: 0.057,
  tunnel: 0.0125,
  cavern: 0.020,
  region: 0.075,
  strata: 0.030,
  veins: 0.022,
  gravel: 0.035,
};

/** @param {number} value @param {number} low @param {number} high @returns {number} */
function clamp(value, low, high) {
  return Math.min(high, Math.max(low, value));
}

/**
 * @param {Uint32Array} field @param {number} index
 * @param {import("./palette.js").Material} material @param {number} seed
 */
function paint(field, index, material, seed) {
  const [r, g, b] = material.rgb;
  const grain = (random01(seed) - 0.5) * 2 * material.grain;
  field[index] = packCell(
    clamp(Math.round(r + grain), 0, 255),
    clamp(Math.round(g + grain), 0, 255),
    clamp(Math.round(b + grain), 0, 255),
    material.bond,
  );
}

/**
 * The skyline, as a world y per column.
 *
 * @param {{ width: number, height: number, seed: number }} world
 * @returns {Float32Array}
 */
export function surfaceProfile({ width, height, seed }) {
  const cellSize = Math.max(2, Math.round(width * FEATURE.ridge));
  const ridge = createNoiseField({ width, height: 1, cellSize, scale: 2.2, seed: seed + 11, octaves: 3 });
  const profile = new Float32Array(width);
  const base = height * SURFACE_LEVEL;
  const relief = height * SURFACE_RELIEF;
  for (let x = 0; x < width; x += 1) {
    profile[x] = base + (sampleField(ridge, x, 0) - 0.5) * 2 * relief;
  }
  return profile;
}

/**
 * @param {{ width: number, height: number, seed?: number }} options
 * @returns {import("./field-format.js").Field}
 */
export function createCaveWorld({ width, height, seed = 1 }) {
  const field = new Uint32Array(new ArrayBuffer(width * height * 4));
  const profile = surfaceProfile({ width, height, seed });
  const bedrockTop = Math.round(height * BEDROCK_LEVEL);

  // Two narrow bands crossing gives worm-like tunnels; a coarser field opens
  // proper caverns; a very coarse one decides which districts are honeycombed
  // and which are solid rock, so the underground is not uniformly porous.
  //
  // Two octaves, not three or four: the top octave is what shapes the edge of a
  // level set, and a fine top octave turns tunnels into speckle.
  /** @param {number} fraction @returns {number} */
  const size = (fraction) => Math.max(2, Math.round(height * fraction));
  const tunnelA = createNoiseField({ width, height, cellSize: size(FEATURE.tunnel), scale: 6, seed: seed + 101, octaves: 2 });
  const tunnelB = createNoiseField({ width, height, cellSize: size(FEATURE.tunnel), scale: 6, seed: seed + 202, octaves: 2 });
  const cavern = createNoiseField({ width, height, cellSize: size(FEATURE.cavern), scale: 5, seed: seed + 303, octaves: 2 });
  const region = createNoiseField({ width, height, cellSize: size(FEATURE.region), scale: 3, seed: seed + 606, octaves: 2 });
  const strata = createNoiseField({ width, height, cellSize: size(FEATURE.strata), scale: 4, seed: seed + 404, octaves: 2 });
  const veins = createNoiseField({ width, height, cellSize: size(FEATURE.veins), scale: 4, seed: seed + 505, octaves: 2 });
  // Pockets of loose spoil buried in the rock. Blast into one and it runs.
  const spoil = createNoiseField({ width, height, cellSize: size(FEATURE.gravel), scale: 4, seed: seed + 707, octaves: 2 });

  for (let x = 0; x < width; x += 1) {
    const surface = profile[x];
    const soilDepth = height * (0.018 + sampleField(strata, x, surface) * 0.030);
    const top = Math.min(height, Math.floor(surface) + 1);
    for (let y = 0; y < top; y += 1) {
      const index = cellIndex(x, y, width);
      if (y < bedrockTop) {
        paint(field, index, MATERIALS.bedrock, index * 2654435761);
        continue;
      }

      const depth = surface - y;
      if (depth < 3) {
        paint(field, index, MATERIALS.topsoil, index * 2654435761);
        continue;
      }
      if (depth < soilDepth) {
        const sandy = sampleField(strata, x, y) > 0.66;
        paint(field, index, sandy ? MATERIALS.sand : MATERIALS.dirt, index * 2654435761);
        continue;
      }

      // Below the soil: stone, with the cave system cut out of it. `reach`
      // takes the whole cave system to nothing just under the soil and just
      // above the bedrock, so the world keeps a lid and a floor. It is the
      // smaller of the two ramps, not their product — a product would still be
      // pinching the caves shut through the entire middle of the rock.
      const reach = Math.min(
        clamp((depth - soilDepth) / (height * 0.02), 0, 1),
        clamp((y - bedrockTop) / (height * 0.03), 0, 1),
      );
      // Some districts are honeycombed, some are near-solid.
      const porosity = reach * (0.55 + sampleField(region, x, y) * 1.15);
      if (sampleField(cavern, x, y) < 0.30 * porosity) continue;
      const tunnel = Math.abs(sampleField(tunnelA, x, y) - 0.5) < 0.065 * porosity
        && Math.abs(sampleField(tunnelB, x, y) - 0.5) < 0.095 * porosity;
      if (tunnel) continue;

      const shade = sampleField(strata, x, y);
      const loose = sampleField(spoil, x, y);
      const ore = sampleField(veins, x, y);
      // Wobble the deep-stone boundary with the strata field, or it reads as a
      // ruled line across the whole world.
      const deep = depth > height * (0.40 + (shade - 0.5) * 0.14);
      let material = deep ? MATERIALS.deepStone : MATERIALS.stone;
      if (!deep && shade > 0.62) material = MATERIALS.paleStone;
      if (loose > 0.70) material = MATERIALS.gravel;
      else if (ore > 0.845) material = deep ? MATERIALS.water : MATERIALS.ore;
      paint(field, index, material, index * 2654435761);
    }
  }

  growSurface(field, { width, height, seed }, profile);
  growCaves(field, { width, height, seed }, profile);
  return settleBonds(field, { width, height });
}

/**
 * Grass tufts and the occasional tree along the skyline.
 *
 * @param {Uint32Array} field
 * @param {{ width: number, height: number, seed: number }} world
 * @param {Float32Array} profile
 */
export function growSurface(field, { width, height, seed }, profile) {
  let nextTree = 0;
  for (let x = 0; x < width; x += 1) {
    const top = Math.floor(profile[x]);
    if (top < 1 || top >= height - 1) continue;
    const roll = random01((x * 7919) ^ (seed * 13));
    if (x >= nextTree && roll > 0.55) {
      const spacing = width * FEATURE.spacing;
      nextTree = x + Math.round(spacing * (0.26 + random01(x ^ seed) * 0.74));
      growTree(field, { width, height, seed }, x, top + 1);
      continue;
    }
    if (roll > 0.30) {
      const blades = 1 + Math.floor(random01((x * 104729) ^ seed) * 6);
      for (let step = 0; step < blades; step += 1) {
        const y = top + 1 + step;
        if (y >= height) break;
        paint(field, cellIndex(x, y, width), MATERIALS.grass, (x * 31 + y) ^ seed);
      }
    }
  }
}

/**
 * @param {Uint32Array} field
 * @param {{ width: number, height: number, seed: number }} world
 * @param {number} x @param {number} base
 */
function growTree(field, { width, height, seed }, x, base) {
  // Sized as a fraction of the world like everything else, so a tree is a tree
  // at any scale instead of punching through the top of a small one.
  const trunk = Math.max(2, Math.round(height * FEATURE.trunk * (0.4 + random01(x ^ (seed * 3)) * 0.6)));
  for (let step = 0; step < trunk; step += 1) {
    const y = base + step;
    if (y >= height) return;
    for (let across = -1; across <= 1; across += 1) {
      const column = x + across;
      if (column < 0 || column >= width) continue;
      paint(field, cellIndex(column, y, width), MATERIALS.bark, (column * 17 + y) ^ seed);
    }
  }
  const crown = base + trunk;
  const radius = Math.max(1, Math.round(height * FEATURE.canopy * (0.5 + random01(x ^ (seed * 5)) * 0.5)));
  for (let dy = -radius; dy <= radius; dy += 1) {
    for (let dx = -radius; dx <= radius; dx += 1) {
      const y = crown + dy;
      const column = x + dx;
      if (column < 0 || column >= width || y < 0 || y >= height) continue;
      const falloff = (dx * dx) / (radius * radius) + (dy * dy) / (radius * radius * 0.7);
      if (falloff > 1 || random01((column * 61 + y * 13) ^ seed) < falloff * 0.7) continue;
      paint(field, cellIndex(column, y, width), MATERIALS.leaf, (column * 97 + y) ^ seed);
    }
  }
}

/**
 * Moss and glowcaps on cave floors, vines hanging from cave ceilings.
 *
 * Vines are static, like everything else that grows: roots are what let a plant
 * hang off a ceiling without the sand rule pulling it straight down.
 *
 * @param {Uint32Array} field
 * @param {{ width: number, height: number, seed: number }} world
 * @param {Float32Array} profile
 */
export function growCaves(field, { width, height, seed }, profile) {
  for (let x = 0; x < width; x += 1) {
    // Stop at the skyline: open sky is not a cave, and moss has no business
    // sprouting out of thin air above a field of grass.
    const top = Math.min(height - 1, Math.floor(profile[x]) - 1);
    for (let y = 1; y < top; y += 1) {
      const index = cellIndex(x, y, width);
      if (isOccupied(field[index])) continue;
      const floor = isOccupied(field[index - width]);
      const ceiling = isOccupied(field[index + width]);
      const wall = (x > 0 && isOccupied(field[index - 1])) || (x < width - 1 && isOccupied(field[index + 1]));
      if (!floor && !ceiling && !wall) continue;
      const roll = random01((index * 2246822519) ^ seed);
      if (floor) {
        // A mossy carpet with gaps in it, and the odd glowcap for contrast.
        if (roll < 0.004) growMushroom(field, { width, height, seed }, x, y);
        else if (roll < 0.035) paint(field, index, MATERIALS.glow, index ^ seed);
        else if (roll < 0.52) paint(field, index, MATERIALS.moss, index ^ seed);
        continue;
      }
      if (ceiling && roll > 0.90) {
        const length = 2 + Math.floor(random01(index ^ (seed * 7)) * 22);
        for (let step = 0; step < length; step += 1) {
          const target = index - step * width;
          if (target < 0 || isOccupied(field[target])) break;
          paint(field, target, MATERIALS.vine, target ^ seed);
        }
        continue;
      }
      // Thin growth clinging to the walls, so a cavern is not a black void.
      if (wall && roll > 0.72) paint(field, index, MATERIALS.moss, index ^ seed);
    }
  }
}

/**
 * @param {Uint32Array} field
 * @param {{ width: number, height: number, seed: number }} world
 * @param {number} x @param {number} base
 */
function growMushroom(field, { width, height, seed }, x, base) {
  const stalk = 3 + Math.floor(random01(x ^ base ^ seed) * 7);
  for (let step = 0; step < stalk; step += 1) {
    const y = base + step;
    if (y >= height || isOccupied(field[cellIndex(x, y, width)])) return;
    paint(field, cellIndex(x, y, width), MATERIALS.stalk, (x + y) ^ seed);
  }
  const cap = random01(x ^ (seed * 11)) < 0.5 ? MATERIALS.capRed : MATERIALS.capViolet;
  const radius = 2 + Math.floor(random01(base ^ seed) * 4);
  for (let dx = -radius; dx <= radius; dx += 1) {
    for (let dy = 0; dy <= 1; dy += 1) {
      const column = x + dx;
      const y = base + stalk + dy;
      if (column < 0 || column >= width || y >= height) continue;
      if (Math.abs(dx) + dy > radius) continue;
      if (isOccupied(field[cellIndex(column, y, width)])) continue;
      paint(field, cellIndex(column, y, width), cap, (column * 7 + y) ^ seed);
    }
  }
}

/**
 * Glues the world together.
 *
 * Every cell's bond is lowered to the support it actually has, so nothing in
 * the generated world is already letting go: the moment you press play it sits
 * perfectly still, however steep the slope it was carved into. A cell keeps its
 * material bond wherever that bond is already met, so buried sand is still sand
 * and stone is still stone.
 *
 * What this buys is the behaviour that a loose/static flag could not give:
 * material that holds its shape until something takes its neighbours away. Blow
 * a hole in a bank and the cells around the crater are suddenly one neighbour
 * short of the bond they were pinned at, so they let go — and the deficit walks
 * outward through the pile, a ring per frame, as a collapse.
 *
 * @param {import("./field-format.js").Field} field
 * @param {{ width: number, height: number }} world
 * @returns {import("./field-format.js").Field}
 */
export function settleBonds(field, { width, height }) {
  const settled = new Uint32Array(new ArrayBuffer(field.length * 4));
  settled.set(field);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = cellIndex(x, y, width);
      const word = field[index];
      if (!isOccupied(word)) continue;
      const bond = cellBond(word);
      if (bond === 0) continue;
      // Water is never pinned down. Lowering its bond to the support it happens
      // to have would turn a buried seam into ordinary rock, and it would never
      // flow when something opened it up.
      if (bond === WATER_BOND) continue;
      // Read support from the untouched copy so the pass does not depend on
      // the order cells happen to be visited in.
      const { total } = neighbourSupport(field, x, y, { width, height });
      if (total < bond) settled[index] = withBond(word, total);
    }
  }
  return /** @type {import("./field-format.js").Field} */ (settled);
}
