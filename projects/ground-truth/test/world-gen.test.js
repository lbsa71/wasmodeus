import test from "node:test";
import assert from "node:assert/strict";

import { createCaveWorld, settleBonds, surfaceProfile } from "../src/core/world-gen.js";
import { cellIndex } from "../src/core/geometry.js";
import { cellBond, isOccupied, packCell, unpackCell } from "../src/core/field-format.js";
import { neighbourSupport } from "../src/core/sand.js";
import { MATERIALS } from "../src/core/palette.js";

// Small enough to be quick, large enough that every feature still appears —
// the generator sizes everything as a fraction of the world for exactly this
// reason.
const WORLD = { width: 512, height: 288 };

/** @type {import("../src/core/field-format.js").Field} */
let world;
/** @param {number} x @param {number} y @returns {number} */
const at = (x, y) => world[cellIndex(x, y, WORLD.width)];

test.before(() => { world = createCaveWorld({ ...WORLD, seed: 5 }); });

test("the world is a pure function of its seed", () => {
  assert.deepEqual(createCaveWorld({ ...WORLD, seed: 5 }), world);
  assert.notDeepEqual(createCaveWorld({ ...WORLD, seed: 6 }), world);
});

test("the world starts glued: every cell has the support its bond asks for", () => {
  // This is what a bond buys over a loose/static flag. Nothing is already
  // letting go, however steep the slope it was carved into, so the world sits
  // perfectly still until something takes a cell's neighbours away.
  for (let y = 0; y < WORLD.height; y += 1) {
    for (let x = 0; x < WORLD.width; x += 1) {
      const word = at(x, y);
      if (!isOccupied(word)) continue;
      const bond = cellBond(word);
      if (bond === 0) continue;
      const { total } = neighbourSupport(world, x, y, WORLD);
      assert.ok(total >= bond, `cell ${x},${y} needs ${bond} neighbours but has ${total}`);
    }
  }
});

test("settling weakens only what it must, so material keeps its character", () => {
  // If every cell came out pinned at its own support the world would be one
  // uniform material and nothing would behave like sand once disturbed. Most
  // cells are buried interior rock and should still carry the palette's bond.
  const bonds = new Map();
  for (const word of world) {
    if (!isOccupied(word)) continue;
    const bond = cellBond(word);
    bonds.set(bond, (bonds.get(bond) ?? 0) + 1);
  }
  const occupied = [...bonds.values()].reduce((a, b) => a + b, 0);
  assert.ok(bonds.size >= 4, `only ${bonds.size} distinct bonds in the world`);
  assert.ok(
    (bonds.get(MATERIALS.stone.bond) ?? 0) > occupied * 0.4,
    "most of the world should still be rock at its own bond, not weakened to its support",
  );
  assert.ok((bonds.get(MATERIALS.bedrock.bond) ?? 0) > 0, "bedrock should be immovable");
});

test("there is bedrock below and open sky above", () => {
  const ceiling = Math.round(WORLD.height * 0.96);
  for (let x = 0; x < WORLD.width; x += 1) {
    assert.ok(isOccupied(at(x, 0)), `column ${x} has no floor`);
    for (let y = ceiling; y < WORLD.height; y += 1) {
      assert.equal(isOccupied(at(x, y)), false, `${x},${y} pokes out of the top of the world`);
    }
  }
});

test("there are caves: open space well below the surface", () => {
  const profile = surfaceProfile({ ...WORLD, seed: 5 });
  let underground = 0;
  let hollow = 0;
  for (let x = 0; x < WORLD.width; x += 1) {
    const deepest = Math.floor(profile[x]) - Math.round(WORLD.height * 0.10);
    for (let y = Math.round(WORLD.height * 0.06); y < deepest; y += 1) {
      underground += 1;
      if (!isOccupied(at(x, y))) hollow += 1;
    }
  }
  const carved = hollow / underground;
  assert.ok(carved > 0.08, `only ${(100 * carved).toFixed(1)}% of the rock is carved out`);
  assert.ok(carved < 0.60, `${(100 * carved).toFixed(1)}% carved leaves no rock to speak of`);
});

test("the surface rolls rather than sitting flat or spiking", () => {
  const profile = surfaceProfile({ ...WORLD, seed: 5 });
  const relief = Math.max(...profile) - Math.min(...profile);
  assert.ok(relief > WORLD.height * 0.02, "the skyline is flat");
  assert.ok(relief < WORLD.height * 0.30, "the skyline is a saw blade");
  const steps = Array.from({ length: WORLD.width - 1 }, (_, x) => Math.abs(profile[x + 1] - profile[x]));
  assert.ok(Math.max(...steps) < 4, "the skyline has a cliff in it");
});

test("the world spans the range from bedrock to dry sand", () => {
  let weak = 0;
  let solid = 0;
  for (const word of world) {
    if (!isOccupied(word)) continue;
    solid += 1;
    // Anything needing four or more neighbours runs once it is disturbed.
    if (cellBond(word) >= MATERIALS.dirt.bond) weak += 1;
  }
  assert.ok(weak > solid * 0.02, `only ${(100 * weak / solid).toFixed(1)}% of the world can flow`);
  assert.ok(weak < solid * 0.5, "almost nothing is strong enough to hold a cave open");
});

/**
 * @param {import("../src/core/palette.js").Material} material
 * @returns {number} how many cells sit within the material's colour grain
 */
function census(material) {
  const [mr, mg, mb] = material.rgb;
  let count = 0;
  for (const word of world) {
    if (!isOccupied(word)) continue;
    const { r, g, b } = unpackCell(word);
    const slack = material.grain + 1;
    if (Math.abs(r - mr) <= slack && Math.abs(g - mg) <= slack && Math.abs(b - mb) <= slack) count += 1;
  }
  return count;
}

test("things grow: grass on the surface, moss and vines in the caves", () => {
  assert.ok(census(MATERIALS.grass) > 40, "no grass");
  assert.ok(census(MATERIALS.moss) > 40, "no moss lining the caves");
  assert.ok(census(MATERIALS.vine) > 10, "no vines hanging from the ceilings");
});

test("nothing grows out of thin air above the skyline", () => {
  // Grass and trees rise from the skyline; cave moss must stay under it. The
  // headroom is one tree's full height, itself a fraction of the world, so this
  // stays a real assertion at any size rather than a fixed pixel allowance.
  const profile = surfaceProfile({ ...WORLD, seed: 5 });
  const headroom = Math.round(WORLD.height * 0.032) + 2;
  for (let x = 0; x < WORLD.width; x += 1) {
    for (let y = Math.floor(profile[x]) + headroom; y < WORLD.height; y += 1) {
      assert.equal(isOccupied(at(x, y)), false, `something is floating at ${x},${y}`);
    }
  }
});

test("settling lowers a bond to the support a cell actually has", () => {
  const size = { width: 5, height: 5 };
  const field = /** @type {import("../src/core/field-format.js").Field} */ (
    new Uint32Array(new ArrayBuffer(size.width * size.height * 4))
  );
  // A grain floating in mid-air, and one buried in a block.
  field[cellIndex(2, 3, size.width)] = packCell(1, 2, 3, 6);
  for (let y = 0; y <= 1; y += 1) {
    for (let x = 1; x <= 3; x += 1) field[cellIndex(x, y, size.width)] = packCell(1, 2, 3, 6);
  }
  const settled = settleBonds(field, size);

  const floating = settled[cellIndex(2, 3, size.width)];
  assert.equal(cellBond(floating), 0, "nothing holds it, so nothing is asked of it");
  assert.ok(isOccupied(floating), "settling must not delete it");
  // The middle of the block keeps its material bond: it is genuinely buried.
  assert.equal(cellBond(settled[cellIndex(2, 0, size.width)]), 6);
});

test("settling does not depend on the order cells are visited in", () => {
  const size = { width: 6, height: 3 };
  const field = /** @type {import("../src/core/field-format.js").Field} */ (
    new Uint32Array(new ArrayBuffer(size.width * size.height * 4))
  );
  for (let x = 0; x < size.width; x += 1) field[cellIndex(x, 0, size.width)] = packCell(4, 5, 6, 5);
  const once = settleBonds(field, size);
  assert.deepEqual(settleBonds(field, size), once, "the input must be left untouched");
  assert.deepEqual(settleBonds(once, size), once, "and the result must be a fixed point");
});
